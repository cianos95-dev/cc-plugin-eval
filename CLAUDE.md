# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

cc-plugin-eval is a 4-stage evaluation framework for testing Claude Code plugin component triggering. It evaluates whether skills, agents, commands, hooks, and MCP servers correctly activate when expected.

**Requirements**: Node.js >= 20.0.0, Anthropic API key

## Build & Development Commands

```bash
# Install dependencies
npm install

# Build
npm run build          # Compiles TypeScript to dist/
npm run dev            # Watch mode - recompiles on changes

# Lint & Type Check
npm run lint           # ESLint with TypeScript strict rules
npm run lint:fix       # Auto-fix linting issues
npm run typecheck      # tsc --noEmit

# Test
npm run test           # Run all tests with Vitest
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report
npm run test:ui        # Vitest UI in browser

# Run a single test file
npx vitest run tests/unit/stages/1-analysis/skill-analyzer.test.ts

# Run tests matching a pattern
npx vitest run -t "SkillAnalyzer"

# Clean build artifacts
npm run clean              # Removes dist/ and coverage/
```

**Test behavior**: Tests run in parallel with randomized order (catches order-dependent bugs). Default timeout is 30s per test. CI retries failed tests twice before failing.

## Additional Linters

Run before committing:

```bash
# Prettier (code formatting)
npx prettier --check "src/**/*.ts" "*.json" "*.md"
npx prettier --write "src/**/*.ts" "*.json" "*.md"

# Markdown
markdownlint "*.md"
markdownlint --fix "*.md"

# YAML
uvx yamllint -c .yamllint.yml config.yaml .yamllint.yml

# GitHub Actions
actionlint .github/workflows/*.yml
```

## CLI Usage

```bash
# Full pipeline evaluation
cc-plugin-eval run -p ./path/to/plugin

# Individual stages
cc-plugin-eval analyze -p ./path/to/plugin    # Stage 1 only
cc-plugin-eval generate -p ./path/to/plugin   # Stages 1-2
cc-plugin-eval execute -p ./path/to/plugin    # Stages 1-3

# Dry-run (cost estimation only)
cc-plugin-eval run -p ./plugin --dry-run

# Resume interrupted run
cc-plugin-eval resume -r <run-id>

# Re-run only failed scenarios from previous run
cc-plugin-eval run -p ./plugin --fast

# Output in different formats
cc-plugin-eval run -p ./plugin --output junit-xml  # json, yaml, junit-xml, tap
```

## Architecture

### 4-Stage Pipeline

```text
Stage 1: Analysis → Stage 2: Generation → Stage 3: Execution → Stage 4: Evaluation
```

| Stage             | Purpose                                                                             | Output            |
| ----------------- | ----------------------------------------------------------------------------------- | ----------------- |
| **1. Analysis**   | Parse plugin structure, extract triggers                                            | `analysis.json`   |
| **2. Generation** | Create test scenarios (LLM for skills/agents, deterministic for commands/hooks/MCP) | `scenarios.json`  |
| **3. Execution**  | Run scenarios via Claude Agent SDK with tool capture                                | `transcripts/`    |
| **4. Evaluation** | Programmatic detection first, LLM judge for quality                                 | `evaluation.json` |

### Key Directory Structure

```text
src/
├── index.ts              # CLI entry point (env.js MUST be first import)
├── env.ts                # Environment setup (dotenv with quiet: true)
├── config/               # YAML/JSON config loading with Zod validation
├── stages/
│   ├── 1-analysis/       # Plugin parsing, trigger extraction
│   ├── 2-generation/     # Scenario generation (LLM + deterministic)
│   ├── 3-execution/      # Agent SDK integration, tool capture via hooks
│   └── 4-evaluation/     # Programmatic detection, LLM judge, conflict tracking
├── state/                # Resume capability, checkpoint management
├── types/                # TypeScript interfaces
└── utils/                # Retry, concurrency, rate limiting, logging, sanitization

tests/
├── unit/                 # Unit tests (mirror src/ structure)
│   └── stages/           # Per-stage test files
├── integration/          # Integration tests
├── mocks/                # Mock implementations for testing
└── fixtures/             # Test data and mock plugins
```

### Detection Strategy

**Programmatic detection is primary** - parse `Skill`, `Task`, `SlashCommand`, and MCP tool calls (pattern: `mcp__<server>__<tool>`) from transcripts for 100% confidence detection. For hooks, detect `SDKHookResponseMessage` events from the Agent SDK. For MCP servers, detect tool invocations via `isMcpTool()` and `parseMcpToolName()` utilities. LLM judge is secondary, used only for quality assessment and edge cases where programmatic detection fails.

### Hooks Evaluation

**Status**: Integrated into pipeline (PR #58). Enable with `scope.hooks: true` in config.

Hooks evaluation foundation includes:

- **Stage 1 (Analysis)**: `hook-analyzer.ts` parses hooks.json and extracts hook components
  - Hook names use `EventType::Matcher` format (e.g., "PreToolUse::Write|Edit") to avoid delimiter conflicts
  - Behavior inference from hook content (block, allow, modify, log, context)
  - Matcher pattern parsing for tool matching

- **Stage 2 (Generation)**: `hook-scenario-generator.ts` generates test scenarios deterministically
  - Tool-to-prompt mapping for predictable hook triggering
  - Event-type-specific scenarios (PreToolUse, Stop, SessionStart, etc.)
  - Negative scenarios for matcher validation

- **Stage 3 (Execution)**: Hook response capture via `SDKHookResponseMessage`
  - `createHookResponseCollector()` processes SDK messages during execution
  - 100% confidence detection from SDK events (no inference needed)

- **Stage 4 (Evaluation)**: Programmatic hook detection
  - `detectFromHookResponses()` extracts hook activations from captured responses
  - `wasExpectedHookTriggered()` matches hooks by name and event type
  - `detectAllComponentsWithHooks()` integrates hook detection with other components

**Known Limitations**:

- Session lifecycle hooks (SessionStart, SessionEnd) fire once per session
- Detection relies on SDK emitting `hook_response` messages

### MCP Servers Evaluation

**Status**: Integrated into pipeline (PR #63). Enable with `scope.mcp_servers: true` in config.

MCP (Model Context Protocol) servers provide external tool integration. Evaluation tests whether MCP servers register tools correctly and respond to invocations.

- **Stage 1 (Analysis)**: `mcp-analyzer.ts` parses .mcp.json and extracts MCP server configurations
  - Supports stdio, sse, http, websocket transport types
  - Infers auth requirements from environment variable patterns (TOKEN, KEY, SECRET, etc.)
  - Extracts server configs but tools are discovered at runtime

- **Stage 2 (Generation)**: `mcp-scenario-generator.ts` generates test scenarios **deterministically** (like hooks, not LLM-based)
  - Server-type-to-prompt mapping for predictable MCP tool triggering
  - Generates direct, variation, negative, and auth-required scenarios
  - Zero LLM cost for MCP scenario generation

- **Stage 3 (Execution)**: MCP tool capture via existing PreToolUse hooks
  - Leverages existing `isMcpTool()` and `parseMcpToolName()` from `hook-capture.ts`
  - MCP tools follow pattern: `mcp__<server>__<tool>`
  - SDK automatically loads and connects to MCP servers

- **Stage 4 (Evaluation)**: Programmatic MCP detection
  - `detectFromCaptures()` and `detectFromTranscript()` detect MCP tool invocations
  - `wasExpectedMcpServerUsed()` matches by server name
  - 100% confidence detection from tool captures

**Known Limitations**:

- Tool schemas not validated (would require JSON Schema library)
- Per-tool scenario generation deferred to future iteration
- Cross-component conflict detection (MCP + skill) deferred

### Adding New Component Types

When implementing evaluation for a new component type, choose the appropriate pattern:

**Deterministic Pattern** (commands, hooks, MCP):

- Component triggering is predictable (same input → same component)
- Use when: Tool invocation, syntax-based, or configuration-based triggering
- Files needed: `{type}-analyzer.ts`, `{type}-scenario-generator.ts`
- Generation: NO LLM calls, uses mapping tables or templates
- Example: Hooks use tool matchers, MCP uses tool names, commands use `/command` syntax

**LLM Pattern** (skills, agents):

- Component triggering is semantic (different phrasing → same intent)
- Use when: Natural language matching, fuzzy intent recognition
- Files needed: `{type}-analyzer.ts`, `{type}-scenario-generator.ts` with Anthropic SDK calls
- Generation: LLM creates variations, paraphrases, edge cases
- Example: Skills use trigger phrases, agents use example contexts

**Integration checklist**:

1. Define types in `src/types/` (component interface, trigger info)
2. Create analyzer in Stage 1 (parse component files, extract metadata)
3. Create scenario generator in Stage 2 (deterministic or LLM-based)
4. Extend detection in Stage 4 (`programmatic-detector.ts`)
5. Update `AnalysisOutput` interface in `src/types/state.ts`
6. Add to pipeline in `src/stages/{1,2,4}-*/index.ts`
7. Add state migration in `src/state/state-manager.ts`
8. Add tests for analyzer and generator

### Stage 3 Execution Flow

**For all component types**:

1. Agent SDK loads plugin from path (validates manifest, discovers components)
2. PreToolUse hooks capture tool invocations in real-time via `createToolCaptureCollector()`
3. Hook response collector captures `SDKHookResponseMessage` events via `createHookResponseCollector()`
4. Transcripts are saved per scenario for Stage 4 analysis

**Component-specific behavior**:

- **Skills/Agents/Commands**: Triggered via `Skill`, `Task`, `SlashCommand` tool calls
- **Hooks**: Fire on events (PreToolUse, Stop, SessionStart, etc.), responses captured via SDK system messages
- **MCP servers**: SDK automatically connects to servers, tools become available via `mcp__<server>__<tool>` pattern

**No code changes needed in Stage 3** when adding new component types - tool capture is universal. Just ensure new tools are parsed in Stage 4 detection.

### Two SDK Integration Points

1. **Anthropic SDK** (`@anthropic-ai/sdk`) - Used in Stages 2 and 4 for LLM calls (scenario generation, judgment)
2. **Agent SDK** (`@anthropic-ai/claude-agent-sdk`) - Used in Stage 3 for execution with plugin loading

### Environment Setup

Create `.env` with:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

**Critical**: `import './env.js'` must be the FIRST import in `src/index.ts` to load environment variables before other modules. The `env.ts` module configures dotenv with `quiet: true` to suppress v17+ runtime logging.

## Configuration

Main config is `config.yaml`. Key settings:

- `scope`: Enable/disable skill, agent, command, hook, MCP evaluation
- `generation.diversity`: 0-1 ratio controlling base scenarios vs variations
- `execution.disallowed_tools`: Block Write/Edit/Bash during evaluation
- `evaluation.detection_mode`: `programmatic_first` (default) or `llm_only`

## Code Conventions

- ESM modules with NodeNext resolution
- Strict TypeScript (all strict flags enabled, `noUncheckedIndexedAccess`)
- Explicit return types on all functions
- Import order enforced by ESLint: builtin → external → internal → parent → sibling (alphabetized within groups)
- Prefix unused parameters with `_`
- Use `type` imports for type-only imports (`import type { Foo }` or `import { type Foo }`)
- Coverage thresholds: 78% lines/statements, 75% functions, 65% branches

## Key Implementation Details

- **Retry with exponential backoff** in `src/utils/retry.ts` for transient API errors
- **Semaphore-based concurrency** in `src/utils/concurrency.ts` for parallel execution
- **Rate limiter** via `createRateLimiter()` in `src/utils/concurrency.ts` for API call protection
- **PII sanitizer** in `src/utils/sanitizer.ts` for redacting sensitive data from verbose logs
- **Model pricing externalized** in `src/config/pricing.ts` for easy updates
- **State checkpointing** after each stage enables resume on interruption
- **Tool capture via PreToolUse hooks** during SDK execution for programmatic detection
- **Symlink resolution** in plugin path validation for robust path handling

## Implementation Patterns

### Custom Error Classes with Cause Chains

```typescript
// Pattern in src/config/loader.ts
export class ConfigLoadError extends Error {
  override readonly cause?: Error | undefined;
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "ConfigLoadError";
    this.cause = cause;
  }
}
// Usage: throw new ConfigLoadError("Failed to read config", originalError);
```

### Type Guards for Tool Detection

```typescript
// Pattern in src/stages/4-evaluation/programmatic-detector.ts
function isSkillInput(input: unknown): input is SkillToolInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "skill" in input &&
    typeof (input as SkillToolInput).skill === "string"
  );
}
```

### Handler Map for Stage-Based Resume

```typescript
// Pattern in src/index.ts - polymorphic dispatch based on pipeline stage
const resumeHandlers: Record<PipelineStage, ResumeHandler> = {
  pending: resumeFromAnalysis,
  analysis: resumeFromAnalysis,
  generation: resumeFromGeneration,
  execution: resumeFromExecution,
  evaluation: resumeFromEvaluation,
  complete: resumeFromEvaluation,
};
// State files stored at: results/<plugin-name>/<run-id>/state.json
```

### State Migration for New Component Types

```typescript
// Pattern in src/state/state-manager.ts - migrate legacy state when loading
function migrateState(state: PipelineState): PipelineState {
  // Add new component types with default empty values for backward compatibility
  const legacyComponents = state.analysis.components as {
    skills: SkillComponent[];
    agents: AgentComponent[];
    commands: CommandComponent[];
    hooks?: HookComponent[]; // Added in PR #58
    mcp_servers?: McpComponent[]; // Added in PR #63
  };

  return {
    ...state,
    analysis: {
      ...state.analysis,
      components: {
        ...legacyComponents,
        hooks: legacyComponents.hooks ?? [],
        mcp_servers: legacyComponents.mcp_servers ?? [],
      },
      // Also migrate trigger_understanding in same pattern
    },
  };
}
```

When adding new component types, update `migrateState()` to provide default values for legacy state files.
