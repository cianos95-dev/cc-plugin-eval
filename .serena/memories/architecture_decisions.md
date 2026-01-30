# Architecture Decisions

## Why 4 Stages?

The pipeline is split into 4 distinct stages for:

1. **Resumability**: Each stage checkpoints to `state.json`, enabling resume after failures
2. **Cost Control**: Generation (Stage 2) and Execution (Stage 3) are expensive; separating them allows dry-run cost estimation
3. **Debugging**: Intermediate outputs (`analysis.json`, `scenarios.json`, transcripts) are inspectable
4. **Flexibility**: Run partial pipelines (`analyze`, `generate`, `execute`) for iterative development

## Detection Strategy: Programmatic First, LLM Fallback

**Decision**: Use programmatic detection as primary, LLM judge as fallback.

**Rationale**:

- Programmatic detection is fast, deterministic, and free
- LLM judges are expensive and can hallucinate
- Most triggers can be detected programmatically via tool captures

**Implementation** (`src/stages/4-evaluation/detection/`):

The detection logic is decomposed into multiple files for maintainability:

| File | Purpose |
|------|---------|
| `orchestrator.ts` | Main detection orchestration (`detectAllComponents`, `detectAllComponentsWithHooks`) |
| `capture-detection.ts` | Tool capture parsing (`detectFromCaptures`) |
| `agents.ts` | Agent-specific detection logic |
| `commands.ts` | Command-specific detection logic |
| `hooks.ts` | Hook-specific detection logic |
| `correlation.ts` | Result correlation utilities |
| `helpers.ts` | Shared detection utilities |
| `types.ts` | Detection type definitions |

```typescript
// Detection confidence levels
const CONFIDENCE = {
  PROGRAMMATIC: 1.0, // Tool capture match (e.g., Skill tool with skill name)
  HOOK_RESPONSE: 1.0, // Hook fired (SDKHookResponseMessage)
  TRANSCRIPT: 0.8, // Pattern match in transcript text
  LLM_JUDGE: 0.6, // LLM evaluation (fallback)
};
```

**Detection Flow** (via `detectAllComponentsWithHooks()` in `orchestrator.ts`):

1. `detectAllComponents()` → `detectFromCaptures()` - Check tool captures (100% confidence)
2. `detectFromSubagentCaptures()` - Agent detection from SubagentStart/Stop hooks (100% confidence)
3. `detectFromHookResponses()` - Check hook events for hook scenarios (100% confidence)
4. `detectFromTranscript()` - Pattern match on raw transcript (80% confidence fallback)
5. LLM judge - Only if programmatic detection is ambiguous (60% confidence)

## Tool Capture via SDK Hooks

**Decision**: Capture tool invocations via SDK hooks rather than parsing transcripts.

**Rationale**:

- PreToolUse hooks fire before tool execution with full input data
- PostToolUse hooks capture tool success/failure status for accurate detection
- SubagentStart/SubagentStop hooks enable accurate agent detection
- Transcript parsing is fragile and may miss details
- Captures include exact input for type-safe detection

**Implementation** (`src/stages/3-execution/tool-capture-hooks.ts` + `hooks-factory.ts`):

- Registers PreToolUse hooks for all tools (captures input, timestamp, toolUseId)
- Registers PostToolUse hooks for all tools (captures success/failure status)
- Registers SubagentStart/SubagentStop hooks for agent detection
- Stores `ToolCapture[]` with name, input, timestamp, toolUseId, success flag
- Success flag enables accurate detection of tool execution outcomes

## Hooks Factory: Stateful vs Stateless

**Decision**: Split SDK hooks into stateful and stateless categories for performance.

**Rationale**:

- In batched execution mode, some hooks need per-scenario state (capture maps)
- Other hooks only perform side effects without holding state
- Stateless hooks can be created once and reused across scenarios
- Reduces callback allocation overhead (~15-20% in batched mode)

**Implementation** (`src/stages/3-execution/hooks-factory.ts`):

| Hook Type | Hooks | Lifecycle |
|-----------|-------|-----------|
| **Stateful** | PreToolUse, SubagentStart | Created per-scenario, reference scenario-specific capture maps |
| **Stateless** | PostToolUse, PostToolUseFailure, SubagentStop | Created once, shared across scenarios |

```typescript
// Stateful hooks are created per-scenario with unique capture maps
const statefulHooks = createScenarioStatefulHooks({
  captureMap: new Map(),
  subagentCaptureMap: new Map(),
  onToolCapture: callback,
  onSubagentCapture: callback,
});

// Stateless hooks are created once and shared
const statelessHooks = createBatchStatelessHooks({
  captureMap: sharedCaptureMap,
  subagentCaptureMap: sharedSubagentMap,
});

// Assembled into SDK config
const config = assembleHooksConfig(statelessHooks, statefulHooks);
```

## Session Strategies

**Decision**: Support multiple session strategies for different testing needs.

| Strategy               | Behavior                                | Use Case                           |
| ---------------------- | --------------------------------------- | ---------------------------------- |
| `batched_by_component` | Scenarios for same component share session with `/clear` | Faster (~80%), default             |
| `isolated`             | New session per scenario                | Strict isolation, highest accuracy |

**Default**: `batched_by_component` for performance (~80% faster startup). Use `isolated` when strict isolation is needed or when testing plugins that modify filesystem state.

## Scenario Generation: Hybrid Approach

**Decision**: Use LLM generation for skills/agents, deterministic for commands/hooks/MCP.

**Rationale**:

- Skills and agents have semantic triggers requiring natural language understanding
- Commands have deterministic triggers (`/command-name`)
- Hooks map directly to tool patterns
- MCP tools have deterministic naming (`mcp__server__tool`)

**Cost Implications**:

- Skills/agents: ~$0.01-0.05 per component (LLM generation)
- Commands/hooks/MCP: $0 (deterministic templates)

## Type Safety for Tool Detection

**Decision**: Use TypeScript type guards for tool input validation.

**Implementation** (detection helpers):

```typescript
interface SkillToolInput {
  skill: string;
  args?: string;
}

function isSkillInput(input: unknown): input is SkillToolInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "skill" in input &&
    typeof (input as SkillToolInput).skill === "string"
  );
}
```

This prevents runtime errors from malformed SDK responses.

## Conflict Tracking

**Decision**: Track and report when multiple components could match a scenario.

**Rationale**:

- Plugin components may have overlapping triggers
- Evaluation should surface these conflicts for plugin authors
- Conflicts affect metric interpretation

**Severity Levels**:

- `low`: Different component types triggered
- `medium`: Same type, different components
- `high`: Ambiguous expected component

## State Migration

**Decision**: Provide defaults for new fields in state files.

**Rationale**:

- Adding new component types (e.g., MCP servers) shouldn't break existing runs
- `migrateState()` in `src/state/operations.ts` handles backwards compatibility

**Pattern**:

```typescript
function migrateState(state: PartialState): FullState {
  return {
    ...state,
    analysis: {
      ...state.analysis,
      mcp_servers: state.analysis?.mcp_servers ?? [],
    },
  };
}
```

## Per-Model Cost Tracking

**Decision**: Track costs per model rather than just per scenario.

**Rationale**:

- Different models have different pricing tiers
- Thinking tokens (extended thinking) have separate pricing
- Accurate cost attribution helps with budget management

**Implementation**:

- Cost tracking in `src/stages/3-execution/` captures model info per request
- Thinking token limits can be configured separately
- Cost breakdown available in evaluation results by model

## Error Handling: Cause Chains

**Decision**: Use error cause chains for debugging context.

**Implementation**:

```typescript
class ConfigLoadError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ConfigLoadError";
    this.cause = cause;
  }
}
```

This preserves the original error while adding context at each layer.

## Result Aggregation

**Decision**: Decompose result aggregation logic into reusable components.

**Rationale**:

- Batch evaluation and single-scenario evaluation share aggregation logic
- Separation improves testability and maintainability

**Implementation** (`src/stages/4-evaluation/aggregation/`):

| File | Purpose |
|------|---------|
| `batch-results.ts` | Batch result aggregation |
| `scenario-results.ts` | Per-scenario result aggregation |
| `types.ts` | Aggregation type definitions |
