# Public API

This package exports a programmatic API via the `exports` field in `package.json`.

## Entry Points

| Subpath                | Description                                 |
| ---------------------- | ------------------------------------------- |
| `cc-plugin-eval`       | Main entry: stage runners + config loader   |
| `cc-plugin-eval/types` | Type definitions (types-only, zero runtime) |

## Exported Functions

These are exported from the main entry (`cc-plugin-eval`):

| Export                    | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `runAnalysis`             | Stage 1: Parse plugin structure and extract triggers     |
| `runGeneration`           | Stage 2: Generate test scenarios for components          |
| `runExecution`            | Stage 3: Execute scenarios and capture tool interactions |
| `runEvaluation`           | Stage 4: Evaluate results and calculate metrics          |
| `loadConfigWithOverrides` | Load configuration with CLI-style overrides              |
| `consoleProgress`         | Default progress reporter for execution/evaluation       |
| `CLIOptions` (type)       | Type for CLI override options                            |

## Usage Example

```typescript
import {
  runAnalysis,
  runGeneration,
  loadConfigWithOverrides,
} from "cc-plugin-eval";
import type { EvalConfig, TestScenario } from "cc-plugin-eval/types";

const config = loadConfigWithOverrides("config.yaml", {
  plugin: "./my-plugin",
});
const analysis = await runAnalysis(config);
const { scenarios } = await runGeneration(analysis, config);
```

## Internal vs Public

Functions in `src/cli/` marked with `@internal` JSDoc are CLI-only helpers not intended for external use. These include resume handlers, option extractors, and output formatters.
