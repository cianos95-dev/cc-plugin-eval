# LLM Judge Calibration

This document specifies how LLM judges are configured, versioned, and calibrated against human evaluation in the cc-plugin-eval framework.

## Purpose

LLM judges provide automated assessment of plugin quality across multiple dimensions. Calibration ensures these judges produce verdicts that correlate with human expert judgment, establishing trust in the framework's automated evaluation.

## Judge Architecture Overview

The framework uses specialized judges for different evaluation dimensions rather than a single general-purpose judge. This follows the pattern established in the Bloom framework, where domain-specific prompts outperform generic evaluation.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Judge Orchestration                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Scenario + Response ──┬──► Trigger Judge ──────► triggerCorrect: bool     │
│                        │                                                    │
│                        ├──► Code Validity Judge ► codeValid: bool          │
│                        │                                                    │
│                        ├──► Technical Judge ────► technicalScore: 1-5      │
│                        │                                                    │
│                        └──► Completeness Judge ─► completenessScore: 1-5   │
│                                                                             │
│                              ▼                                              │
│                        Aggregate Metrics                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Judge Prompt Versioning

Every judge prompt is versioned to ensure reproducibility. When prompts change, correlation metrics may shift, so version tracking is essential.

### Version Schema

```typescript
interface JudgePromptVersion {
  judgeId: string; // e.g., "trigger-accuracy-judge"
  version: string; // Semantic version, e.g., "1.2.0"
  hash: string; // SHA-256 of prompt content
  createdAt: string;
  changelog: string; // What changed from previous version
  correlationBaseline?: {
    // Correlation when this version was calibrated
    spearmanRho: number;
    sampleSize: number;
    calibrationDate: string;
  };
}
```

### Storage Location

Judge prompts are stored in `src/stages/4-evaluation/prompts/` with version metadata:

```text
src/stages/4-evaluation/prompts/
├── trigger-accuracy/
│   ├── v1.0.0.md
│   ├── v1.1.0.md
│   └── current.md -> v1.1.0.md (symlink)
├── code-validity/
│   └── ...
├── technical-accuracy/
│   └── ...
└── completeness/
    └── ...
```

### Version Selection

By default, the framework uses the `current` version. For reproducibility or A/B testing, specific versions can be selected:

```yaml
# config.yaml
evaluation:
  judges:
    trigger-accuracy:
      promptVersion: "1.1.0" # Pin to specific version
    technical-accuracy:
      promptVersion: "current" # Use latest
```

## Model Configuration

### Default Model

The framework defaults to Claude Sonnet 4.5 for judge calls, balancing quality and cost. For calibration runs comparing against human labels, Claude Opus 4.5 can be used.

```yaml
# config.yaml
evaluation:
  judges:
    model: "claude-sonnet-4-5-20250514" # Default
    # model: "claude-opus-4-5-20250514"  # For calibration
```

### Temperature Settings

Judge calls use low temperature for consistency:

| Setting     | Value | Rationale                                      |
| ----------- | ----- | ---------------------------------------------- |
| Temperature | 0.0   | Maximum determinism for reproducible verdicts  |
| Max tokens  | 1024  | Sufficient for verdict + rationale             |
| Top-p       | 1.0   | No nucleus sampling (temperature handles this) |

### Multi-Sampling Strategy

For higher confidence, judges can sample multiple times and aggregate:

```yaml
evaluation:
  judges:
    sampling:
      enabled: true
      samples: 3 # Number of judge calls per scenario
      aggregation: "majority" # or "unanimous", "any"
      varianceTracking: true # Track disagreement across samples
```

When multi-sampling is enabled, the framework records:

1. Individual verdicts from each sample
2. Aggregated verdict using the specified strategy
3. Variance metric (disagreement rate across samples)

High variance scenarios may indicate ambiguous cases or judge prompt weaknesses.

## Judge Prompts by Dimension

### Trigger Accuracy Judge

The most objective judge, determining whether the correct component triggered.

**Input context**:

- Plugin manifest (components defined)
- Scenario (expected trigger)
- Tool captures (actual tools invoked)
- Response content

**Output schema**:

```typescript
interface TriggerJudgment {
  triggerCorrect: boolean;
  observedTrigger: string | null; // What actually triggered
  expectedTrigger: string; // What should have triggered
  confidence: "high" | "medium" | "low";
  rationale: string;
}
```

**Key prompt elements**:

- Explicit mapping from tool captures to component types
- Clear criteria for "triggered" vs "invoked but not triggered"
- Handling of edge cases (multiple triggers, partial triggers)

### Code Validity Judge

Assesses whether code examples are syntactically and semantically correct.

**Input context**:

- Extracted code blocks with language tags
- Plugin domain (expected languages/frameworks)
- Version context (if specified)

**Output schema**:

```typescript
interface CodeValidityJudgment {
  overallValid: boolean;
  codeBlocks: Array<{
    index: number;
    language: string;
    syntaxValid: boolean;
    semanticValid: boolean;
    issues: string[];
  }>;
  confidence: "high" | "medium" | "low";
  rationale: string;
}
```

**Key prompt elements**:

- Language-specific syntax rules
- Common runtime error patterns
- Import/dependency validation heuristics

### Technical Accuracy Judge

Evaluates factual correctness of technical information.

**Input context**:

- Response content
- Plugin domain documentation (if available)
- Known ground truth (API references, etc.)

**Output schema**:

```typescript
interface TechnicalAccuracyJudgment {
  score: 1 | 2 | 3 | 4 | 5;
  accurateElements: string[];
  inaccuracies: Array<{
    claim: string;
    issue: string;
    severity: "minor" | "moderate" | "major";
  }>;
  confidence: "high" | "medium" | "low";
  rationale: string;
}
```

**Key prompt elements**:

- Domain-specific accuracy criteria
- Version-aware validation
- Deprecation awareness

### Completeness Judge

Assesses whether the response fully addresses the query.

**Input context**:

- Original query/scenario
- Response content
- Expected coverage (from scenario generation)

**Output schema**:

```typescript
interface CompletenessJudgment {
  score: 1 | 2 | 3 | 4 | 5;
  coveredElements: string[];
  missingElements: string[];
  excessElements: string[]; // Off-topic or unnecessary content
  confidence: "high" | "medium" | "low";
  rationale: string;
}
```

**Key prompt elements**:

- Query decomposition into sub-questions
- Coverage tracking
- Relevance filtering

## Calibration Process

### Step 1: Baseline Measurement

Run judges on human-labeled scenarios without any prompt tuning:

```bash
# Generate scenarios for corpus plugins
cc-plugin-eval run -p ./corpus/plugin-1 --through generation
cc-plugin-eval run -p ./corpus/plugin-2 --through generation
# ... for all corpus plugins

# Run evaluation with baseline prompts
cc-plugin-eval run -p ./corpus/plugin-1 --from evaluation
# ...
```

### Step 2: Correlation Calculation

Compare judge verdicts against human labels:

```bash
cc-plugin-eval calibrate \
  --human-labels ./labels/trigger-accuracy.json \
  --judge-results ./results/evaluation.json \
  --dimension trigger-accuracy
```

Output:

```text
Calibration Results: Trigger Accuracy
=====================================
Sample size: 50 scenarios
Human-Judge Agreement: 84%
Spearman ρ: 0.78
95% CI: [0.65, 0.87]

Confusion Matrix:
                Judge: Yes  Judge: No
Human: Yes         38          4
Human: No           4          4

Disagreement Analysis:
- False positives: 4 (judge said trigger correct, human said no)
- False negatives: 4 (judge said trigger wrong, human said correct)
```

### Step 3: Prompt Refinement

When correlation is below target (ρ < 0.80), analyze disagreements:

1. **Identify patterns**: Do disagreements cluster around specific component types, trigger patterns, or scenario categories?

2. **Review rationales**: Compare judge rationales with human reasoning for disagreements.

3. **Refine prompts**: Update prompt to address identified weaknesses.

4. **Version and re-test**: Create new prompt version, re-run calibration.

### Step 4: Validation

After refinement, validate on held-out scenarios (not used for tuning) to confirm improvement generalizes.

## Calibration Metrics

### Primary Metric: Spearman Correlation

For ordinal judgments (scores 1-5), Spearman's ρ measures rank correlation:

```text
ρ = 1 - (6 * Σd²) / (n * (n² - 1))

where d = difference in ranks between human and judge
      n = number of scenarios
```

Target: ρ ≥ 0.80

### Secondary Metrics

| Metric    | Use Case                               | Target |
| --------- | -------------------------------------- | ------ |
| Cohen's κ | Binary judgments (trigger correct Y/N) | ≥ 0.75 |
| Accuracy  | Simple agreement rate                  | ≥ 85%  |
| F1 Score  | When class imbalance exists            | ≥ 0.80 |
| MAE       | Numeric scores (1-5)                   | ≤ 0.5  |

### Confidence Intervals

Bootstrap confidence intervals (1000 resamples) provide uncertainty estimates:

```typescript
interface CalibrationResult {
  metric: "spearman" | "kappa" | "accuracy";
  value: number;
  confidenceInterval: {
    lower: number; // 2.5th percentile
    upper: number; // 97.5th percentile
  };
  sampleSize: number;
}
```

If CI is wide, more labeled samples are needed.

## Tracking Calibration History

Calibration results are tracked over time to monitor judge quality:

```json
{
  "judgeId": "trigger-accuracy-judge",
  "calibrationHistory": [
    {
      "promptVersion": "1.0.0",
      "date": "2025-01-15",
      "spearmanRho": 0.72,
      "sampleSize": 30,
      "notes": "Initial baseline"
    },
    {
      "promptVersion": "1.1.0",
      "date": "2025-01-20",
      "spearmanRho": 0.81,
      "sampleSize": 50,
      "notes": "Improved tool capture parsing guidance"
    }
  ]
}
```

## Cost Considerations

Judge calls consume API tokens. Calibration runs should be budgeted:

| Model      | Input ($/1M) | Output ($/1M) | Est. per Scenario |
| ---------- | ------------ | ------------- | ----------------- |
| Sonnet 4.5 | $3.00        | $15.00        | ~$0.02            |
| Opus 4.5   | $15.00       | $75.00        | ~$0.10            |

For 100 scenarios × 4 dimensions × 3 samples = 1,200 judge calls:

- Sonnet: ~$24
- Opus: ~$120

Use Sonnet for iteration, Opus for final validation.

## Next Steps

1. **Implement prompt versioning**: Add to `src/stages/4-evaluation/`
2. **Build calibration CLI**: `cc-plugin-eval calibrate` command
3. **Create baseline prompts**: Document current prompts as v1.0.0
4. **Run initial calibration**: Measure baseline correlation
5. **Iterate**: Refine prompts until ρ ≥ 0.80
