/**
 * Agent executor for Stage 3: Execution.
 *
 * Executes test scenarios through the Claude Agent SDK with
 * plugin loaded. Captures tool invocations via PreToolUse hooks
 * and tracks success/failure via PostToolUse/PostToolUseFailure hooks
 * for programmatic detection in Stage 4.
 */

import { DEFAULT_TUNING } from "../../config/defaults.js";
import { getModelPricing } from "../../config/pricing.js";
import { logger } from "../../utils/logging.js";
import { withRetry } from "../../utils/retry.js";

import { createHookResponseCollector } from "./hook-capture.js";
import {
  createCaptureHooksConfig,
  type SDKHooksConfig,
} from "./hooks-factory.js";
import {
  executeQuery,
  getErrorFromMessage,
  getMessageId,
  isResultMessage,
  isUserMessage,
  type SDKMessage,
  type SDKPermissionDenial,
  type QueryInput,
  type QueryObject,
  type PluginReference,
  type SettingSource,
  type ModelUsage,
} from "./sdk-client.js";
import {
  buildTranscript,
  createErrorEvent,
  type TranscriptBuilderContext,
} from "./transcript-builder.js";

import type {
  ExecutionConfig,
  ExecutionResult,
  TestScenario,
  TranscriptErrorEvent,
  ToolCapture,
  SubagentCapture,
  HookResponseCapture,
} from "../../types/index.js";

/**
 * Query function type for dependency injection in tests.
 */
export type QueryFunction = (input: QueryInput) => QueryObject;

/** Create an API error event from error text */
function createApiError(errorText: string): TranscriptErrorEvent {
  return {
    type: "error",
    error_type: "api_error",
    message: errorText,
    timestamp: Date.now(),
    recoverable: false,
  };
}

/** Attempt to rewind file changes if the query object supports it */
async function rewindFileChangesIfPossible(
  q: QueryObject,
  userMessageId: string | undefined,
  scenarioId: string,
): Promise<void> {
  if (!userMessageId || typeof q.rewindFiles !== "function") {
    return;
  }

  try {
    await q.rewindFiles(userMessageId);
    logger.debug(`Reverted file changes for scenario: ${scenarioId}`);
  } catch (rewindErr) {
    logger.warn(
      `Failed to rewind files for ${scenarioId}: ${rewindErr instanceof Error ? rewindErr.message : String(rewindErr)}`,
    );
  }
}

/**
 * Scenario execution options.
 */
export interface ScenarioExecutionOptions {
  /** Scenario to execute */
  scenario: TestScenario;
  /** Path to plugin */
  pluginPath: string;
  /** Plugin name for transcript */
  pluginName: string;
  /** Execution configuration */
  config: ExecutionConfig;
  /** Additional plugins for conflict testing */
  additionalPlugins?: string[] | undefined;
  /** Query function (for testing/dependency injection) */
  queryFn?: QueryFunction | undefined;
  /**
   * Enable MCP server discovery via settingSources.
   * When true (default), uses settingSources: ["project"] which enables
   * the SDK to discover MCP servers from .mcp.json files.
   * When false, uses settingSources: [] to skip MCP discovery and
   * avoid the 60-second MCP channel closure timeout.
   *
   * @default true
   */
  enableMcpDiscovery?: boolean | undefined;
}

/**
 * Build query input for scenario execution.
 *
 * @param scenario - Test scenario to execute
 * @param plugins - Plugin references to load
 * @param config - Execution configuration
 * @param hooks - SDK hooks config for capturing tool invocations
 * @param abortController - AbortController for timeout handling
 * @param startTime - Execution start timestamp for logging
 * @param enableMcpDiscovery - Whether to enable MCP server discovery
 * @param enableFileCheckpointing - Whether to enable file checkpointing for rewind support
 */
function buildQueryInput(
  scenario: TestScenario,
  plugins: PluginReference[],
  config: ExecutionConfig,
  hooks: SDKHooksConfig,
  abortController: AbortController,
  startTime: number,
  enableMcpDiscovery: boolean,
  enableFileCheckpointing = false,
): QueryInput {
  // Build allowed tools list - ensure trigger tools are always included
  const allowedTools = [
    ...(config.allowed_tools ?? []),
    "Skill",
    "SlashCommand",
    "Task",
    "Read",
    "Glob",
    "Grep",
  ];

  // Determine settingSources based on MCP discovery option
  const settingSources: SettingSource[] = enableMcpDiscovery ? ["project"] : [];

  return {
    prompt: scenario.user_prompt,
    options: {
      plugins,
      settingSources,
      allowedTools,
      disallowedTools: config.disallowed_tools,
      model: config.model,
      // Use Claude Code system prompt for accurate plugin evaluation
      systemPrompt: { type: "preset", preset: "claude_code" },
      maxTurns: config.max_turns,
      persistSession: false, // Session isolation
      maxBudgetUsd: config.max_budget_usd,
      abortController,
      permissionMode: config.permission_bypass
        ? "bypassPermissions"
        : "default",
      allowDangerouslySkipPermissions: config.permission_bypass,
      // Enable file checkpointing for rewind support (used by executeScenarioWithCheckpoint)
      ...(enableFileCheckpointing ? { enableFileCheckpointing: true } : {}),
      ...(config.max_thinking_tokens !== undefined
        ? { maxThinkingTokens: config.max_thinking_tokens }
        : {}),
      hooks,
      stderr: (data: string): void => {
        const elapsed = Date.now() - startTime;
        logger.debug(
          `[Scenario ${scenario.id} ${String(elapsed)}ms] SDK stderr: ${data.trim()}`,
        );
      },
    },
  };
}

/**
 * Execution context created by prepareExecutionContext.
 */
interface ExecutionContext {
  /** Collected SDK messages */
  messages: SDKMessage[];
  /** Captured tool invocations */
  detectedTools: ToolCapture[];
  /** Captured subagent invocations */
  subagentCaptures: SubagentCapture[];
  /** Collected error events */
  errors: TranscriptErrorEvent[];
  /** Hook response collector */
  hookCollector: ReturnType<typeof createHookResponseCollector>;
  /** Abort controller for timeout */
  controller: AbortController;
  /** Timeout ID (for cleanup) */
  timeout: ReturnType<typeof setTimeout>;
  /** Execution start timestamp */
  startTime: number;
}

/**
 * Prepare execution context with arrays, hook collector, and timeout handling.
 *
 * @param timeoutMs - Timeout in milliseconds
 * @returns Execution context for scenario execution
 */
function prepareExecutionContext(timeoutMs: number): ExecutionContext {
  const messages: SDKMessage[] = [];
  const detectedTools: ToolCapture[] = [];
  const subagentCaptures: SubagentCapture[] = [];
  const errors: TranscriptErrorEvent[] = [];
  const hookCollector = createHookResponseCollector();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();

  return {
    messages,
    detectedTools,
    subagentCaptures,
    errors,
    hookCollector,
    controller,
    timeout,
    startTime,
  };
}

/**
 * Capture hooks infrastructure result.
 *
 * Note: The capture maps (captureMap, subagentCaptureMap) are created internally
 * and passed to createCaptureHooksConfig(). They're used by the hooks for
 * correlating Pre/Post tool events but are not needed by callers.
 */
interface CaptureInfrastructure {
  /** Plugin references to load */
  plugins: PluginReference[];
  /** SDK hooks configuration */
  hooksConfig: SDKHooksConfig;
}

/**
 * Set up plugin list and capture hooks infrastructure.
 *
 * @param pluginPath - Path to main plugin
 * @param additionalPlugins - Additional plugin paths for conflict testing
 * @param detectedTools - Array to push captured tools to
 * @param subagentCaptures - Array to push captured subagents to
 * @returns Capture infrastructure for execution
 */
function setupCaptureInfrastructure(
  pluginPath: string,
  additionalPlugins: string[],
  detectedTools: ToolCapture[],
  subagentCaptures: SubagentCapture[],
): CaptureInfrastructure {
  // Build plugin list
  const plugins: PluginReference[] = [{ type: "local", path: pluginPath }];
  for (const additionalPath of additionalPlugins) {
    plugins.push({ type: "local", path: additionalPath });
  }

  // Create capture hooks using the factory
  const captureMap = new Map<string, ToolCapture>();
  const subagentCaptureMap = new Map<string, SubagentCapture>();
  const hooksConfig = createCaptureHooksConfig({
    captureMap,
    onToolCapture: (capture) => detectedTools.push(capture),
    subagentCaptureMap,
    onSubagentCapture: (capture) => subagentCaptures.push(capture),
  });

  return { plugins, hooksConfig };
}

/**
 * Result metrics extracted from SDK messages.
 */
interface ResultMetrics {
  costUsd: number;
  durationMs: number;
  numTurns: number;
  permissionDenials: SDKPermissionDenial[];
  modelUsage?: Record<string, ModelUsage>;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/**
 * Build execution result from collected data.
 *
 * @param scenarioId - Scenario ID
 * @param context - Transcript builder context
 * @param messages - Collected SDK messages
 * @param errors - Collected error events
 * @param detectedTools - Captured tool invocations
 * @param hookResponses - Collected hook responses
 * @param subagentCaptures - Captured subagent invocations
 * @param metrics - Extracted result metrics
 * @returns ExecutionResult object
 */
function buildExecutionResult(
  scenarioId: string,
  context: TranscriptBuilderContext,
  messages: SDKMessage[],
  errors: TranscriptErrorEvent[],
  detectedTools: ToolCapture[],
  hookResponses: HookResponseCapture[],
  subagentCaptures: SubagentCapture[],
  metrics: ResultMetrics,
): ExecutionResult {
  return {
    scenario_id: scenarioId,
    transcript: buildTranscript(context, messages, errors),
    detected_tools: detectedTools,
    hook_responses: hookResponses,
    ...(subagentCaptures.length > 0
      ? { subagent_captures: subagentCaptures }
      : {}),
    cost_usd: metrics.costUsd,
    api_duration_ms: metrics.durationMs,
    num_turns: metrics.numTurns,
    permission_denials: metrics.permissionDenials,
    errors,
    ...(metrics.modelUsage !== undefined
      ? { model_usage: metrics.modelUsage }
      : {}),
    cache_read_tokens: metrics.cacheReadTokens,
    cache_creation_tokens: metrics.cacheCreationTokens,
  };
}

/**
 * Finalize execution and build result.
 *
 * Handles error conversion and constructs the final ExecutionResult.
 *
 * @param ctx - Execution context
 * @param scenario - Test scenario
 * @param pluginName - Plugin name for transcript
 * @param model - Model used for execution
 * @returns ExecutionResult object
 */
function finalizeExecution(
  ctx: ExecutionContext,
  scenario: TestScenario,
  pluginName: string,
  model: string,
): ExecutionResult {
  const transcriptContext: TranscriptBuilderContext = {
    scenario,
    pluginName,
    model,
  };

  return buildExecutionResult(
    scenario.id,
    transcriptContext,
    ctx.messages,
    ctx.errors,
    ctx.detectedTools,
    ctx.hookCollector.responses,
    ctx.subagentCaptures,
    extractResultMetrics(ctx.messages),
  );
}

/**
 * Extract metrics from SDK result message.
 */
function extractResultMetrics(messages: SDKMessage[]): ResultMetrics {
  const resultMsg = messages.find(isResultMessage);

  // Calculate aggregate cache tokens from modelUsage
  const modelUsage = resultMsg?.modelUsage;
  const cacheReadTokens = modelUsage
    ? Object.values(modelUsage).reduce(
        (sum, m) => sum + m.cacheReadInputTokens,
        0,
      )
    : 0;
  const cacheCreationTokens = modelUsage
    ? Object.values(modelUsage).reduce(
        (sum, m) => sum + m.cacheCreationInputTokens,
        0,
      )
    : 0;

  return {
    costUsd: resultMsg?.total_cost_usd ?? 0,
    durationMs: resultMsg?.duration_ms ?? 0,
    numTurns: resultMsg?.num_turns ?? 0,
    permissionDenials: resultMsg?.permission_denials ?? [],
    ...(modelUsage !== undefined ? { modelUsage } : {}),
    cacheReadTokens,
    cacheCreationTokens,
  };
}

/**
 * Execute a single test scenario.
 *
 * Runs the scenario through the Agent SDK with the plugin loaded,
 * capturing all tool invocations via PreToolUse hooks.
 *
 * @param options - Scenario execution options
 * @returns Execution result with transcript and captured tools
 *
 * @example
 * ```typescript
 * const result = await executeScenario({
 *   scenario: testScenario,
 *   pluginPath: './my-plugin',
 *   pluginName: 'my-plugin',
 *   config: executionConfig,
 * });
 *
 * console.log(`Detected ${result.detected_tools.length} tool calls`);
 * ```
 */
export async function executeScenario(
  options: ScenarioExecutionOptions,
): Promise<ExecutionResult> {
  const {
    scenario,
    pluginPath,
    pluginName,
    config,
    additionalPlugins = [],
    queryFn,
  } = options;

  // Prepare execution context
  const ctx = prepareExecutionContext(config.timeout_ms);

  // Set up capture infrastructure
  const { plugins, hooksConfig } = setupCaptureInfrastructure(
    pluginPath,
    additionalPlugins,
    ctx.detectedTools,
    ctx.subagentCaptures,
  );

  try {
    // Build query input
    const queryInput = buildQueryInput(
      scenario,
      plugins,
      config,
      hooksConfig,
      ctx.controller,
      ctx.startTime,
      options.enableMcpDiscovery ?? true,
    );

    // Execute with retry for transient errors
    await withRetry(async () => {
      // Use provided query function or real SDK
      const q = queryFn ? queryFn(queryInput) : executeQuery(queryInput);

      for await (const message of q) {
        ctx.messages.push(message);

        // Process message for hook responses
        ctx.hookCollector.processMessage(message);

        // Capture errors for transcript
        // Note: SDK may send error messages not in its TypeScript union
        const errorText = getErrorFromMessage(message);
        if (errorText !== undefined) {
          ctx.errors.push(createApiError(errorText));
        }
      }
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    ctx.errors.push(createErrorEvent(err, isTimeout));
  } finally {
    clearTimeout(ctx.timeout);
  }

  return finalizeExecution(ctx, scenario, pluginName, config.model);
}

/**
 * Execute a scenario with file checkpointing.
 *
 * For scenarios that test commands/skills that modify files,
 * this enables file checkpointing to undo changes between tests.
 *
 * @param options - Scenario execution options
 * @returns Execution result
 */
export async function executeScenarioWithCheckpoint(
  options: ScenarioExecutionOptions,
): Promise<ExecutionResult> {
  const {
    scenario,
    pluginPath,
    pluginName,
    config,
    additionalPlugins = [],
    queryFn,
  } = options;

  // Prepare execution context
  const ctx = prepareExecutionContext(config.timeout_ms);
  let userMessageId: string | undefined;

  // Set up capture infrastructure
  const { plugins, hooksConfig } = setupCaptureInfrastructure(
    pluginPath,
    additionalPlugins,
    ctx.detectedTools,
    ctx.subagentCaptures,
  );

  try {
    // Build query input with file checkpointing enabled
    const queryInput = buildQueryInput(
      scenario,
      plugins,
      config,
      hooksConfig,
      ctx.controller,
      ctx.startTime,
      options.enableMcpDiscovery ?? true,
      true, // enableFileCheckpointing for rewind support
    );

    // Execute with retry
    await withRetry(async () => {
      const q = queryFn ? queryFn(queryInput) : executeQuery(queryInput);

      for await (const message of q) {
        ctx.messages.push(message);
        ctx.hookCollector.processMessage(message);

        // Capture user message ID for potential rewind
        if (isUserMessage(message)) {
          userMessageId = getMessageId(message) ?? userMessageId;
        }

        // Capture errors from SDK messages
        const errorText = getErrorFromMessage(message);
        if (errorText !== undefined) {
          ctx.errors.push(createApiError(errorText));
        }
      }

      // Rewind file changes after execution
      await rewindFileChangesIfPossible(q, userMessageId, scenario.id);
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    ctx.errors.push(createErrorEvent(err, isTimeout));
  } finally {
    clearTimeout(ctx.timeout);
  }

  return finalizeExecution(ctx, scenario, pluginName, config.model);
}

/**
 * Calculate estimated cost for scenario execution.
 *
 * @param scenarioCount - Number of scenarios
 * @param config - Execution configuration
 * @returns Estimated cost in USD
 */
export function estimateExecutionCost(
  scenarioCount: number,
  config: ExecutionConfig,
): number {
  // Token estimates from tuning config
  const inputTokensPerScenario =
    DEFAULT_TUNING.token_estimates.input_per_turn * config.max_turns;
  const outputTokensPerScenario =
    DEFAULT_TUNING.token_estimates.output_per_turn * config.max_turns;

  // Get pricing from centralized config
  const pricing = getModelPricing(config.model);

  const totalInputTokens = inputTokensPerScenario * scenarioCount;
  const totalOutputTokens = outputTokensPerScenario * scenarioCount;

  const inputCost = (totalInputTokens / 1_000_000) * pricing.input;
  const outputCost = (totalOutputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Check if execution would exceed budget.
 *
 * @param scenarioCount - Number of scenarios
 * @param config - Execution configuration
 * @returns True if estimated cost exceeds budget
 */
export function wouldExceedBudget(
  scenarioCount: number,
  config: ExecutionConfig,
): boolean {
  const estimatedCost = estimateExecutionCost(scenarioCount, config);
  return estimatedCost > config.max_budget_usd;
}

/**
 * Format execution statistics for logging.
 *
 * @param results - Execution results
 * @returns Formatted statistics string
 */
export function formatExecutionStats(results: ExecutionResult[]): string {
  const totalCost = results.reduce((sum, r) => sum + r.cost_usd, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.api_duration_ms, 0);
  const totalTurns = results.reduce((sum, r) => sum + r.num_turns, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalTools = results.reduce(
    (sum, r) => sum + r.detected_tools.length,
    0,
  );

  const lines = [
    `Execution Statistics:`,
    `  Scenarios: ${String(results.length)}`,
    `  Total cost: $${totalCost.toFixed(4)}`,
    `  Total duration: ${String(Math.round(totalDuration / 1000))}s`,
    `  Total turns: ${String(totalTurns)}`,
    `  Total tools captured: ${String(totalTools)}`,
    `  Errors: ${String(totalErrors)}`,
  ];

  if (totalErrors > 0) {
    const errorScenarios = results.filter((r) => r.errors.length > 0);
    lines.push(
      `  Failed scenarios: ${errorScenarios.map((r) => r.scenario_id).join(", ")}`,
    );
  }

  return lines.join("\n");
}
