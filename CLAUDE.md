# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

cc-plugin-eval is a 4-stage evaluation framework for testing Claude Code plugin component triggering. It evaluates whether skills, agents, commands, hooks, and MCP servers correctly activate when expected.

**Requirements**: Node.js >= 20.0.0, Anthropic API key (in `.env` as `ANTHROPIC_API_KEY`)

## Commands

```bash
# Build & Dev
npm run build          # Compile TypeScript to dist/
npm run dev            # Watch mode

# Lint & Type Check
npm run lint           # ESLint
npm run lint:fix       # Auto-fix
npm run typecheck      # tsc --noEmit

# Test
npm run test           # All tests (Vitest)
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage
npm run test:ui        # Visual test UI (opens browser)

# Single test file
npx vitest run tests/unit/stages/1-analysis/skill-analyzer.test.ts

# Tests matching pattern
npx vitest run -t "SkillAnalyzer"

# E2E tests (requires API key, costs money)
RUN_E2E_TESTS=true npm test -- tests/e2e/
RUN_E2E_TESTS=true E2E_MAX_COST_USD=2.00 npm test -- tests/e2e/
```

**Test behavior**: Parallel execution, randomized order, 30s timeout. CI retries failed tests twice.

### Additional Linters

```bash
npx prettier --check "src/**/*.ts" "*.json" "*.md"
markdownlint "*.md"
uvx yamllint -c .yamllint.yml config.yaml .yamllint.yml
actionlint .github/workflows/*.yml
```

## CLI Usage

```bash
cc-plugin-eval run -p ./plugin           # Full pipeline
cc-plugin-eval analyze -p ./plugin       # Stage 1 only
cc-plugin-eval generate -p ./plugin      # Stages 1-2
cc-plugin-eval execute -p ./plugin       # Stages 1-3
cc-plugin-eval run -p ./plugin --dry-run # Cost estimation only
cc-plugin-eval resume -r <run-id>        # Resume interrupted run
cc-plugin-eval run -p ./plugin --fast    # Re-run failed scenarios only
```

## Architecture

### 4-Stage Pipeline

| Stage             | Purpose                                                                             | Output            |
| ----------------- | ----------------------------------------------------------------------------------- | ----------------- |
| **1. Analysis**   | Parse plugin structure, extract triggers                                            | `analysis.json`   |
| **2. Generation** | Create test scenarios (LLM for skills/agents, deterministic for commands/hooks/MCP) | `scenarios.json`  |
| **3. Execution**  | Run scenarios via Claude Agent SDK with tool capture                                | `transcripts/`    |
| **4. Evaluation** | Programmatic detection first, LLM judge for quality                                 | `evaluation.json` |

### Detection Strategy

**Programmatic detection is primary** (100% confidence):

- Parse `Skill`, `Task`, `SlashCommand` tool calls from transcripts
- MCP tools detected via pattern: `mcp__<server>__<tool>`
- Hooks detected via `SDKHookResponseMessage` events from Agent SDK
- LLM judge is secondary, used only for quality assessment

### Two SDK Integration Points

| SDK                              | Stages | Purpose                               |
| -------------------------------- | ------ | ------------------------------------- |
| `@anthropic-ai/sdk`              | 2, 4   | LLM calls for generation and judgment |
| `@anthropic-ai/claude-agent-sdk` | 3      | Plugin loading and execution          |

### Stage 3 Execution Flow

1. Agent SDK loads plugin (validates manifest, discovers components)
2. `createToolCaptureCollector()` captures tool invocations via PreToolUse hooks
3. `createHookResponseCollector()` captures `SDKHookResponseMessage` events
4. Transcripts saved per scenario for Stage 4 analysis

**No code changes needed in Stage 3** when adding new component types - tool capture is universal.

### Stage 4 Batching

When total LLM judge calls >= `batch_threshold` (default 50), uses Anthropic Batches API for **50% cost savings**. Configure via `batch_threshold`, `poll_interval_ms`, or `force_synchronous: true` to bypass.

### Prompt Caching

Stages 2 and 4 use Anthropic's prompt caching for repeated system prompts, reducing costs when generating scenarios or running LLM judgments across multiple components.

## Configuration

Main config: `config.yaml`. Key settings:

- `scope`: Enable/disable skill, agent, command, hook, MCP evaluation
- `generation.diversity`: 0-1 ratio controlling base scenarios vs variations
- `execution.disallowed_tools`: Block Write/Edit/Bash during evaluation
- `evaluation.detection_mode`: `programmatic_first` (default) or `llm_only`

## Code Conventions

- ESM modules with NodeNext resolution
- Strict TypeScript (all strict flags, `noUncheckedIndexedAccess`)
- Explicit return types on all functions
- Import order: builtin → external → internal → parent → sibling (alphabetized)
- Prefix unused parameters with `_`
- Use `type` imports for type-only imports
- Coverage thresholds (in `vitest.config.ts`): 78% lines/statements, 75% functions, 65% branches

## Key Files

| File                         | Purpose                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `src/index.ts`               | CLI entry point (**`import './env.js'` MUST be first import**) |
| `src/env.ts`                 | Environment setup (dotenv with `quiet: true`)                  |
| `src/config/loader.ts`       | YAML/JSON config loading with Zod validation                   |
| `src/config/pricing.ts`      | Model pricing for cost estimation                              |
| `src/utils/retry.ts`         | Retry with exponential backoff                                 |
| `src/utils/concurrency.ts`   | Semaphore-based concurrency, rate limiter                      |
| `src/utils/sanitizer.ts`     | PII redaction for logs                                         |
| `src/utils/logging.ts`       | Centralized logger (chalk-based, respects verbose/debug flags) |
| `src/utils/file-io.ts`       | File I/O helpers (JSON/YAML read/write, mkdir)                 |
| `src/state/state-manager.ts` | State checkpointing and resume, state migration                |
| `tsconfig.eslint.json`       | ESLint-specific tsconfig (includes tests)                      |

### Stage Entry Points

| File                               | Purpose                                    |
| ---------------------------------- | ------------------------------------------ |
| `src/stages/1-analysis/index.ts`   | Orchestrates all analyzers, returns output |
| `src/stages/2-generation/index.ts` | Orchestrates scenario generators           |
| `src/stages/3-execution/index.ts`  | Runs Agent SDK, captures tool calls        |
| `src/stages/4-evaluation/index.ts` | Runs detection and LLM judge               |

### Frequently Modified Files

| File                                               | When to modify                                |
| -------------------------------------------------- | --------------------------------------------- |
| `src/stages/4-evaluation/programmatic-detector.ts` | Adding new component detection patterns       |
| `src/stages/2-generation/*-scenario-generator.ts`  | Changing scenario generation logic            |
| `src/stages/1-analysis/*-analyzer.ts`              | Adding new component parsing                  |
| `src/config/schema.ts`                             | Adding/changing config options                |
| `src/types/state.ts`                               | Extending pipeline state (triggers migration) |

## Adding New Component Types

Choose pattern based on triggering mechanism:

**Deterministic** (commands, hooks, MCP): Predictable triggering via tool invocation or syntax

- Files: `{type}-analyzer.ts`, `{type}-scenario-generator.ts`
- NO LLM calls in generation

**LLM-based** (skills, agents): Semantic triggering via natural language

- Files: `{type}-analyzer.ts`, `{type}-scenario-generator.ts` with Anthropic SDK calls
- LLM generates variations and paraphrases

**Integration checklist**:

1. Define types in `src/types/`
2. Create analyzer in `src/stages/1-analysis/`
3. Create scenario generator in `src/stages/2-generation/`
4. Extend detection in `src/stages/4-evaluation/programmatic-detector.ts`
5. Update `AnalysisOutput` in `src/types/state.ts`
6. Add to pipeline in `src/stages/{1,2,4}-*/index.ts`
7. Add state migration in `src/state/state-manager.ts` (provide defaults for legacy state)
8. Add tests

### State Migration

When adding new component types, update `migrateState()` in `src/state/state-manager.ts` to provide defaults (e.g., `hooks: legacyComponents.hooks ?? []`) so existing state files remain compatible.

### Resume Handlers

The CLI uses a handler map in `src/index.ts` for stage-based resume. State files are stored at `results/<plugin-name>/<run-id>/state.json`.

## Component-Specific Notes

### Hooks

Enable: `scope.hooks: true`

- Hook names use `EventType::Matcher` format (e.g., "PreToolUse::Write|Edit")
- Detection via `SDKHookResponseMessage` events (100% confidence)
- Scenarios generated deterministically via tool-to-prompt mapping
- Limitation: Session lifecycle hooks (SessionStart, SessionEnd) fire once per session

### MCP Servers

Enable: `scope.mcp_servers: true`

- Tools detected via pattern: `mcp__<server>__<tool>`
- Scenarios generated deterministically (zero LLM cost)
- SDK auto-connects to servers defined in `.mcp.json`
- Limitation: Tool schemas not validated

## Implementation Patterns

### Custom Error Classes

Use cause chains for error context (see `src/config/loader.ts:ConfigLoadError`).

### Type Guards

Use type guards for tool detection in `src/stages/4-evaluation/programmatic-detector.ts` (e.g., `isSkillInput()`, `isTaskInput()`).
