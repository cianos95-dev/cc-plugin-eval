# Testing Patterns

## Test Framework

- **Framework**: Vitest
- **Config**: `vitest.config.ts`
- **Structure**: Tests mirror `src/` in `tests/unit/`

## Test Categories

| Category    | Location              | Purpose                        | API Calls        |
| ----------- | --------------------- | ------------------------------ | ---------------- |
| Unit        | `tests/unit/`         | Isolated function/class tests  | None             |
| Integration | `tests/integration/`  | Full stage with real fixtures  | Mocked           |
| E2E         | `tests/e2e/`          | Real pipeline with API         | Real (expensive) |

## Running Tests

```bash
npm run test              # All tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage
npm run test:ui           # Visual UI

# Single file
npx vitest run tests/unit/stages/1-analysis/skill-analyzer.test.ts

# Pattern match
npx vitest run -t "SkillAnalyzer"

# E2E (costs money)
RUN_E2E_TESTS=true npm test -- tests/e2e/
RUN_E2E_TESTS=true E2E_MAX_COST_USD=2.00 npm test -- tests/e2e/
```

## Test Configuration

Key settings from `vitest.config.ts`:

- **Timeout**: 30s (generous for SDK tests)
- **Parallelization**: Thread pool with isolation
- **Randomization**: Shuffle order to catch order-dependent tests
- **CI Retry**: 2 retries in CI, 1 locally
- **Mock Reset**: `clearMocks`, `restoreMocks`, `mockReset` all enabled
- **Coverage Thresholds**: branches 65%, functions 75%, lines 78%

## Mocking Patterns

### SDK Mock (`tests/mocks/sdk-mock.ts`)

Primary mock for Stage 3 execution tests. Simulates Agent SDK without API calls.

```typescript
import { createMockQueryFn, createMockToolCapture } from "../mocks/sdk-mock.js";

// Create mock that simulates tool triggering
const mockQuery = createMockQueryFn({
  triggeredTools: [{ name: "Skill", input: { skill: "commit" } }],
  costUsd: 0.005,
});

// Helper for creating tool captures
const capture = createMockToolCapture("Skill", { skill: "test" });
```

Available mock factories:

- `createMockQueryFn(config)` - Main SDK query mock
- `createMockToolCapture(name, input)` - Tool capture objects
- `createMockExecutionConfig(overrides)` - Execution config
- `createMockScenarioOptions(overrides)` - Scenario options
- `createThrowingQueryFn(error)` - Error simulation
- `createTimeoutQueryFn(delayMs)` - Timeout simulation
- `buildMockQuery(genFn, overrides?)` - Minimal Query mock from async generator

### Query Mock Pattern (`buildMockQuery`)

Use `buildMockQuery()` for all Query mocks. Stubs all 14 Query interface methods
with safe defaults. Pass `overrides` for custom behavior:

```typescript
import { buildMockQuery } from "../mocks/sdk-mock.js";

// Basic usage
const query = buildMockQuery(async function* () { yield initMessage; });

// With custom method overrides
const query = buildMockQuery(
  async function* () { yield initMessage; },
  { mcpServerStatus: async () => { throw new Error("Network error"); } },
);
```

Do NOT use inline `Object.assign(gen, {...})` — that pattern has been fully replaced.

### Test-Local Helpers

Tests often define local helper factories for specific needs:

```typescript
// Common pattern in test files
function createToolCapture(name: string, input: unknown): ToolCapture {
  return {
    name,
    input,
    toolUseId: `tool-${Date.now()}`,
    timestamp: Date.now(),
  };
}

function createScenario(overrides: Partial<TestScenario> = {}): TestScenario {
  return {
    id: "test-scenario-1",
    component_type: "skill",
    // ...defaults
    ...overrides,
  };
}
```

## Fixtures

Location: `tests/fixtures/`

| Fixture                    | Purpose                                    |
| -------------------------- | ------------------------------------------ |
| `valid-plugin/`            | Well-formed plugin with all component types |
| `invalid-plugin/`          | Plugin with validation errors              |
| `malformed-plugin/`        | Plugin with structural issues              |
| `sample-transcripts/`      | Mock execution transcripts                 |
| `test-config.yaml`         | Sample configuration file                  |
| `malformed-mcp-config.json` | Invalid MCP config for error testing       |

### Valid Plugin Structure

```text
valid-plugin/
├── .claude-plugin/plugin.json    # Manifest
├── skills/
│   ├── test-skill/SKILL.md
│   └── greet-skill/SKILL.md
├── agents/
│   ├── test-agent.md
│   └── helper-agent.md
├── commands/
│   ├── test-command.md
│   └── advanced/nested-command.md
├── hooks/hooks.json
└── mcp/.mcp.json
```

## E2E Test Pattern

E2E tests are gated by environment variables and located in `tests/e2e/`:

- `pipeline.test.ts` - Full pipeline tests (skills, agents, commands, hooks, MCP servers)
- `helpers.ts` - Shared utilities for E2E tests (budget tracking, fixture loading)

```typescript
import { describe, it, expect } from "vitest";

describe.skipIf(!process.env.RUN_E2E_TESTS)("Pipeline E2E", () => {
  it("runs full pipeline", async () => {
    // Real API calls happen here
  });
});
```

**Budget Enforcement**:

- `E2E_MAX_COST_USD` environment variable sets overall budget
- Per-test budget assertions ensure individual tests don't exceed limits
- Session batching reduces API calls (~40% cost savings)

## Best Practices

1. **Use fixtures over inline data** for complex plugin structures
2. **Mock at SDK boundary** not internal functions where possible
3. **Test helper factories** should be in test file or `tests/mocks/`
4. **Parallel-safe**: Tests must not share mutable state
5. **Deterministic**: Avoid `Date.now()` in assertions, use fixed timestamps
