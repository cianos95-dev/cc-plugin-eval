# Codebase Structure

## Directory Layout

```text
src/
├── index.ts              # Entry point: public API exports + CLI init
├── env.ts                # Environment variable handling
├── cli/                  # CLI implementation
│   ├── index.ts          # Program setup and command registration
│   ├── commands/         # Individual CLI commands
│   │   ├── run.ts        # Full pipeline command
│   │   ├── analyze.ts    # Stage 1 only
│   │   ├── generate.ts   # Stages 1-2
│   │   ├── execute.ts    # Stages 1-3
│   │   ├── resume.ts     # Resume with handlers
│   │   ├── report.ts     # Report generation
│   │   └── list.ts       # List runs
│   ├── formatters.ts     # Output formatters (JUnit, TAP, CLI)
│   ├── helpers.ts        # State lookup utilities
│   ├── options.ts        # CLI option parsing
│   └── styles.ts         # Commander help styling
├── config/               # Configuration loading with Zod validation
│   ├── index.ts          # Main exports
│   ├── loader.ts         # Config file loading
│   ├── schema.ts         # Zod schemas
│   ├── cli-schema.ts     # CLI-specific schema validation
│   ├── defaults.ts       # Default values
│   ├── models.ts         # Model definitions
│   └── pricing.ts        # API pricing data
├── stages/
│   ├── 1-analysis/       # Plugin parsing, trigger extraction
│   │   ├── index.ts      # runAnalysis()
│   │   ├── plugin-parser.ts
│   │   ├── skill-analyzer.ts
│   │   ├── agent-analyzer.ts
│   │   ├── command-analyzer.ts
│   │   ├── hook-analyzer.ts
│   │   ├── mcp-analyzer.ts
│   │   ├── path-resolver.ts
│   │   ├── preflight.ts
│   │   └── trigger-builder.ts  # Shared utility for building trigger records
│   ├── 2-generation/     # Scenario generation
│   │   ├── index.ts      # runGeneration()
│   │   ├── agent-scenario-generator.ts
│   │   ├── batch-calculator.ts
│   │   ├── command-scenario-generator.ts
│   │   ├── cost-estimator.ts
│   │   ├── diversity-manager.ts
│   │   ├── hook-scenario-generator.ts
│   │   ├── mcp-scenario-generator.ts
│   │   ├── skill-scenario-generator.ts
│   │   └── shared/           # Shared generation utilities
│   │       ├── index.ts
│   │       ├── rate-limiter-setup.ts
│   │       └── response-parser.ts
│   ├── 3-execution/      # Agent SDK integration
│   │   ├── index.ts      # runExecution()
│   │   ├── agent-executor.ts
│   │   ├── hook-capture.ts
│   │   ├── hooks-factory.ts     # SDK hook assembly (stateful/stateless split)
│   │   ├── plugin-loader.ts
│   │   ├── progress-formatters.ts  # Progress display formatting
│   │   ├── progress-reporters.ts
│   │   ├── sdk-client.ts
│   │   ├── session-batching.ts
│   │   ├── tool-capture-hooks.ts  # Tool/subagent capture hooks
│   │   └── transcript-builder.ts
│   └── 4-evaluation/     # Detection and metrics
│       ├── index.ts      # runEvaluation()
│       ├── detection/    # Programmatic detection (decomposed)
│       │   ├── index.ts          # Re-exports detection functions
│       │   ├── orchestrator.ts   # detectAllComponents(), detectAllComponentsWithHooks()
│       │   ├── capture-detection.ts  # detectFromCaptures()
│       │   ├── agents.ts         # Agent-specific detection
│       │   ├── commands.ts       # Command-specific detection
│       │   ├── hooks.ts          # Hook-specific detection
│       │   ├── correlation.ts    # Result correlation
│       │   ├── helpers.ts        # Detection utilities
│       │   └── types.ts          # Detection type definitions
│       ├── aggregation/  # Result aggregation
│       │   ├── index.ts
│       │   ├── batch-results.ts
│       │   ├── scenario-results.ts
│       │   └── types.ts
│       ├── llm-judge.ts
│       ├── judge-utils.ts        # LLM judge utilities
│       ├── batch-evaluator.ts
│       ├── multi-sampler.ts
│       ├── conflict-tracker.ts
│       └── metrics.ts    # calculateEvalMetrics()
├── state/                # Resume capability
│   ├── index.ts          # Re-exports state functions
│   ├── operations.ts     # loadState(), saveState(), migrateState()
│   ├── queries.ts        # State query utilities
│   ├── updates.ts        # State update operations
│   ├── display.ts        # State display formatting
│   └── types.ts          # State type definitions
├── types/                # TypeScript interfaces
│   ├── index.ts          # Re-exports all types
│   ├── state.ts          # State types
│   ├── components.ts     # Component definitions
│   ├── scenario.ts       # Test scenario types
│   ├── evaluation.ts     # Evaluation result types
│   ├── transcript.ts     # Transcript types
│   ├── plugin.ts         # Plugin manifest types
│   ├── mcp.ts            # MCP types
│   ├── config.ts         # Config types
│   ├── cost.ts           # Cost tracking types
│   └── progress.ts       # Progress callback types
└── utils/
    ├── index.ts
    ├── array.ts          # Array utilities
    ├── retry.ts          # Exponential backoff
    ├── concurrency.ts    # Parallel execution control
    ├── logging.ts        # Logger utilities
    ├── llm.ts            # LLM utilities
    ├── parsing.ts        # Parsing utilities
    ├── file-io.ts        # File operations
    └── sanitizer.ts      # Input sanitization

tests/
├── unit/                 # Unit tests (mirror src/ structure)
├── integration/          # Full stage tests
├── e2e/                  # Real API calls (expensive)
├── mocks/                # Mock implementations
└── fixtures/             # Test data
    ├── valid-plugin/         # Well-formed mock plugin
    ├── invalid-plugin/       # Plugin with validation errors
    ├── malformed-plugin/     # Plugin with structural issues
    └── sample-transcripts/   # Mock execution transcripts
```

## 4-Stage Pipeline

| Stage | Purpose | Output |
|-------|---------|--------|
| 1. Analysis | Parse plugin, extract triggers | `analysis.json` |
| 2. Generation | Create test scenarios | `scenarios.json` |
| 3. Execution | Run via Claude Agent SDK | `transcripts/` |
| 4. Evaluation | Detect, judge, calculate metrics | `evaluation.json` |

## Key Entry Points

- CLI: `src/cli/index.ts` → Commander `program`
- Stage 1: `src/stages/1-analysis/index.ts` → `runAnalysis()`
- Stage 2: `src/stages/2-generation/index.ts` → `runGeneration()`
- Stage 3: `src/stages/3-execution/index.ts` → `runExecution()`
- Stage 4: `src/stages/4-evaluation/index.ts` → `runEvaluation()`
- Detection: `src/stages/4-evaluation/detection/orchestrator.ts` → `detectAllComponents()`, `detectAllComponentsWithHooks()`
- Conflict Tracking: `src/stages/4-evaluation/conflict-tracker.ts` → `calculateConflictSeverity()`
- Metrics: `src/stages/4-evaluation/metrics.ts` → `calculateEvalMetrics()`
- State: `src/state/index.ts` → `loadState()`, `saveState()`

## Results Storage

Output stored in `results/<plugin-name>/<run-id>/`:

- `state.json` - Checkpoint for resume
- `analysis.json` - Stage 1 output
- `scenarios.json` - Stage 2 output
- `execution-metadata.json` - Stage 3 execution stats
- `transcripts/` - Stage 3 output
- `evaluation.json` - Stage 4 output
