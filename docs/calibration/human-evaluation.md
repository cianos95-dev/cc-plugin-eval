# Human Evaluation Procedures

This document specifies the procedures, tooling, and protocols for human evaluation of plugin scenarios as part of Phase 3 calibration.

## Purpose

Human labels serve as ground truth for validating LLM judge accuracy. By comparing LLM verdicts against human expert judgment, we can calculate correlation metrics (Spearman ρ) and identify areas where judges need refinement.

## Evaluation Dimensions

We evaluate scenarios across four dimensions, ordered by objectivity (most objective first):

| Dimension              | Description                                | Objectivity | Priority   |
| ---------------------- | ------------------------------------------ | ----------- | ---------- |
| **Trigger Accuracy**   | Did the correct component trigger?         | High        | Start here |
| **Code Validity**      | Do code examples parse and run?            | High        | Second     |
| **Technical Accuracy** | Is the information correct?                | Medium      | Third      |
| **Completeness**       | Does the response fully address the query? | Lower       | Fourth     |

**Recommendation**: Begin calibration with trigger accuracy because it has the clearest ground truth (binary: triggered or not, correct component or not). This establishes baseline methodology before tackling more subjective dimensions.

## Blind Evaluation Protocol

To prevent anchoring bias, human labelers evaluate scenarios without seeing LLM judge verdicts.

### Information Shown to Labelers

For each scenario, labelers see:

1. **Plugin context**: Name, description, component being tested
2. **Test scenario**: The user query/prompt
3. **Expected outcome**: Which component should trigger (from scenario generation)
4. **Actual response**: Claude's response with the plugin loaded
5. **Tool captures**: Which tools were invoked (for trigger verification)

### Information Hidden from Labelers

- LLM judge verdict
- LLM judge confidence score
- LLM judge rationale
- Other labelers' verdicts (until inter-rater analysis)

## Labeling Tool Specification

A CLI tool for efficient scenario labeling.

### Commands

```bash
# Start labeling session for a dimension
cc-plugin-eval label --dimension trigger-accuracy --run-id <run-id>

# Resume interrupted session
cc-plugin-eval label --resume --session-id <session-id>

# Export labels for analysis
cc-plugin-eval label --export --session-id <session-id> --format json
```

### Interactive Flow

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  Scenario 1/45  │  Plugin: commit-commands  │  Component: /commit           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  QUERY:                                                                     │
│  "Can you commit my changes with message 'fix login bug'?"                  │
│                                                                             │
│  EXPECTED: Command /commit should trigger                                   │
│                                                                             │
│  TOOL CAPTURES:                                                             │
│  - Read: src/auth/login.ts                                                  │
│  - Bash: git add -A                                                         │
│  - Bash: git commit -m "fix login bug"                                      │
│                                                                             │
│  RESPONSE PREVIEW:                                                          │
│  "I'll commit your changes with that message. [shows git output]"           │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Did the correct component trigger?                                         │
│                                                                             │
│  [Y] Yes, correct       [N] No, wrong component       [S] Skip/Unclear      │
│  [V] View full response [T] View full tool captures   [Q] Quit & save       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Label Schema

```typescript
interface HumanLabel {
  scenarioId: string;
  dimension:
    | "trigger-accuracy"
    | "code-validity"
    | "technical-accuracy"
    | "completeness";
  labelerId: string;
  timestamp: string;

  // Trigger accuracy
  triggerCorrect?: boolean; // Did correct component trigger?
  triggerComponentObserved?: string; // What actually triggered (if wrong)?

  // Code validity
  codeParses?: boolean; // Does code parse without errors?
  codeRuns?: boolean; // Would code run correctly?
  codeIssues?: string[]; // Specific issues found

  // Technical accuracy
  technicallyCorrect?: boolean; // Is information accurate?
  inaccuracies?: string[]; // Specific inaccuracies found

  // Completeness
  completenessScore?: 1 | 2 | 3 | 4 | 5; // 1=minimal, 5=comprehensive
  missingElements?: string[]; // What was omitted?

  // Common fields
  confidence: "high" | "medium" | "low";
  notes?: string;
  skipped?: boolean;
  skipReason?: string;
}
```

### Session Management

Labels are saved incrementally to prevent data loss:

```typescript
interface LabelingSession {
  sessionId: string;
  labelerId: string;
  dimension: string;
  runId: string;
  startedAt: string;
  lastUpdatedAt: string;

  totalScenarios: number;
  completedScenarios: number;
  skippedScenarios: number;

  labels: HumanLabel[];
}
```

Sessions are stored in `.cc-plugin-eval/labeling-sessions/` with auto-save after each label.

## Inter-Rater Reliability

When multiple labelers evaluate the same scenarios, we measure agreement to assess label quality.

### Metrics

For binary dimensions (trigger accuracy, code validity):

- **Cohen's κ** for two labelers
- **Fleiss' κ** for three or more labelers

For ordinal dimensions (completeness score):

- **Krippendorff's α** with ordinal weighting

### Target Agreement

| Metric           | Acceptable | Good   | Excellent |
| ---------------- | ---------- | ------ | --------- |
| Cohen's κ        | ≥ 0.60     | ≥ 0.75 | ≥ 0.85    |
| Krippendorff's α | ≥ 0.67     | ≥ 0.80 | ≥ 0.90    |

If agreement is below acceptable thresholds, review labeling guidelines for ambiguity and discuss disagreements to refine criteria.

### Disagreement Resolution

1. **Identify disagreements**: Scenarios where labelers differ
2. **Discussion round**: Labelers discuss reasoning (without changing labels)
3. **Consensus label**: If possible, agree on final label
4. **Exclude if unresolvable**: Some scenarios may be genuinely ambiguous

## Sample Size Requirements

Following Bloom's methodology (40 transcripts for ρ = 0.86), we target:

| Phase    | Scenarios per Plugin | Plugins       | Total Scenarios | Human-Labeled     |
| -------- | -------------------- | ------------- | --------------- | ----------------- |
| Initial  | 5                    | 10 (Tier 1+2) | 50              | All 50            |
| Expanded | 5                    | 20            | 100             | All 100           |
| Full     | 5-10                 | 32            | 160-320         | 100-150 (sampled) |

For full corpus, use stratified sampling to ensure representation across:

- Maturity levels (polished, functional, rough, experimental)
- Component types (skills, agents, commands, hooks)
- Trigger complexity (simple, complex, edge cases)

## Labeler Guidelines

### Trigger Accuracy

**Label YES if**:

- Tool captures show the expected component was invoked
- Response indicates the component handled the request
- For commands: the command's tools were used appropriately
- For skills: skill-specific knowledge is evident in response
- For agents: agent delegation is visible in tool captures

**Label NO if**:

- A different component triggered than expected
- No component triggered when one should have
- The component triggered but for the wrong reason

**Label SKIP if**:

- Tool captures are ambiguous or missing
- Cannot determine which component triggered
- Scenario is malformed or unclear

### Code Validity

**Label PARSES if**:

- Code blocks are syntactically valid for their language
- Imports/requires reference real packages
- No obvious syntax errors

**Label RUNS if**:

- Code would execute without runtime errors
- Dependencies are available or clearly documented
- API usage matches current library versions

### Technical Accuracy

**Label CORRECT if**:

- API names, methods, and signatures are accurate
- Version-specific information matches the claimed version
- Best practices align with current recommendations
- No deprecated patterns presented as current

**Label INCORRECT if**:

- Factual errors in API usage
- Outdated patterns without deprecation notice
- Incorrect version compatibility claims

### Completeness

**Score 1** (Minimal): Barely addresses the query, missing major elements
**Score 2** (Partial): Addresses some aspects, significant gaps
**Score 3** (Adequate): Covers main points, minor gaps acceptable
**Score 4** (Good): Comprehensive coverage, well-structured
**Score 5** (Excellent): Thorough, includes edge cases, exemplary

## Data Export Format

Labels export to JSON for correlation analysis:

```json
{
  "exportedAt": "2025-01-24T12:00:00Z",
  "dimension": "trigger-accuracy",
  "runId": "run-abc123",
  "labelerId": "labeler-1",
  "labels": [
    {
      "scenarioId": "scenario-001",
      "triggerCorrect": true,
      "confidence": "high",
      "timestamp": "2025-01-24T10:15:00Z"
    }
  ]
}
```

## Next Steps

1. **Implement CLI labeling tool**: Add to `src/cli/commands/label.ts`
2. **Create labeling session storage**: Extend state management
3. **Build export/analysis commands**: For correlation calculation
4. **Write labeler onboarding docs**: Expand guidelines with examples
5. **Pilot with Tier 1 plugins**: Test workflow before full corpus
