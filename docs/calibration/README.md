# Phase 3: Calibration & Validation

This directory contains documentation for validating that cc-plugin-eval's LLM judges produce results that correlate with human expert judgment. The goal is to establish framework credibility by demonstrating statistically significant agreement between automated and human evaluation.

## Why Calibration Matters

The evaluation framework uses LLM judges to assess plugin quality across multiple dimensions (trigger accuracy, technical correctness, completeness). Before trusting these automated assessments, we need to verify they align with how human experts would evaluate the same plugins.

Anthropic's Bloom framework achieved a Spearman correlation of ρ = 0.86 with human judgment using 40 labeled transcripts. We target similar rigor: **ρ ≥ 0.80** across our evaluation dimensions.

## Documents in This Directory

| Document                                             | Purpose                                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| [corpus.md](corpus.md)                               | The 32-plugin calibration corpus spanning polished → experimental quality levels |
| [human-evaluation.md](human-evaluation.md)           | Procedures for human labeling, blind evaluation protocol, CLI tool specification |
| [llm-judge-calibration.md](llm-judge-calibration.md) | Judge prompt versioning, sampling strategy, temperature settings                 |

## Calibration Workflow

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Phase 3 Calibration Process                         │
└─────────────────────────────────────────────────────────────────────────────┘

1. CORPUS ASSEMBLY (corpus.md)
   └── 32 plugins across 4 maturity levels
       ├── Polished (7)     → Gold standard references
       ├── Functional (12)  → Working with varying docs
       ├── Rough (7)        → Known issues, discrimination testing
       └── Experimental (6) → Edge cases, unconventional patterns

2. SCENARIO GENERATION
   └── Run cc-plugin-eval stages 1-2 on each corpus plugin
       └── ~5-10 scenarios per plugin = 160-320 total scenarios

3. HUMAN LABELING (human-evaluation.md)
   └── Blind evaluation of scenario subsets
       ├── Trigger accuracy (most objective, start here)
       ├── Technical correctness
       └── Completeness
   └── Multiple labelers for inter-rater reliability

4. LLM JUDGE EXECUTION (llm-judge-calibration.md)
   └── Run stage 4 evaluation on same scenarios
       ├── Record judge verdicts and confidence
       └── Track prompt versions for reproducibility

5. CORRELATION ANALYSIS
   └── Calculate Spearman ρ between human and LLM judgments
       ├── Per-dimension correlation
       ├── Aggregate correlation
       └── Confidence intervals via bootstrap
   └── Target: ρ ≥ 0.80

6. ITERATION
   └── If correlation insufficient:
       ├── Refine judge prompts
       ├── Adjust evaluation dimensions
       └── Expand labeled dataset
```

## Current Status

| Milestone            | Status         | Notes                              |
| -------------------- | -------------- | ---------------------------------- |
| Corpus assembly      | ✅ Complete    | 32 plugins documented in corpus.md |
| Scenario generation  | 🔲 Not started | Pending corpus cloning             |
| Human labeling tool  | 🔲 Not started | CLI spec in human-evaluation.md    |
| Initial labeling     | 🔲 Not started | Start with trigger accuracy        |
| LLM judge baseline   | 🔲 Not started | Use current stage 4 prompts        |
| Correlation analysis | 🔲 Not started | —                                  |

## Key Decisions

**Starting with trigger accuracy**: Of the four evaluation dimensions (trigger accuracy, technical accuracy, code validity, completeness), trigger accuracy is the most objective and easiest to label. A scenario either triggered the expected component or it didn't. This makes it ideal for initial calibration work.

**Blind evaluation**: Human labelers evaluate scenarios without seeing LLM judge verdicts to prevent anchoring bias.

**Inter-rater reliability**: Where feasible, multiple labelers evaluate the same scenarios to measure agreement (Cohen's κ or Krippendorff's α).

## References

- [Bloom Technical Report](https://alignment.anthropic.com/2025/bloom-auto-evals) — Anthropic's approach to LLM-as-judge validation
- [Bloom GitHub](https://github.com/safety-research/bloom) — Reference implementation
