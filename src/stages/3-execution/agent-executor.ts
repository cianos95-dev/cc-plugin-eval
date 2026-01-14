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
  executeQuery,
  isErrorMessage,
  isResultMessage,
  isUserMessage,
  type SDKMessage,
  type QueryInput,
  type QueryObject,
  type PluginReference,
  type PreToolUseHookConfig,
  type PostToolUseHookConfig,
  type PostToolUseFailureHookConfig,
  type HookCallback,
  type SettingSource,
} from "./sdk-client.js";
import {
  buildTranscript,
  type TranscriptBuilderContext,
} from "./transcript-builder.js";

import type {
  ExecutionConfig,
  ExecutionResult,
  TestScenario,
  TranscriptErrorEvent,
  ToolCapture,
} from "../../types/index.js";

/**
 * Query function type for dependency injection in tests.
 */
export type QueryFunction = (input: QueryInput) => QueryObject;

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
 * Create a tool capture hook.
 *
 * Returns a hook callback that captures all tool invocations
 * for later analysis.
 *
 * @param captures - Array to push captured tools into
 * @param captureMap - Map for correlating Pre/Post hooks by toolUseId
 * @returns Hook callback
 */
function createPreToolUseHook(
  captures: ToolCapture[],
  captureMap: Map<string, ToolCapture>,
): HookCallback {
  return async (input, toolUseId, _context) => {
    // PreToolUse hooks receive PreToolUseHookInput which has tool_name and tool_input
    if ("tool_name" in input && "tool_input" in input) {
      const capture: ToolCapture = {
        name: input.tool_name,
        input: input.tool_input,
        toolUseId,
        timestamp: Date.now(),
      };
      captures.push(capture);

      // Store in map for Post hook correlation
      if (toolUseId) {
        captureMap.set(toolUseId, capture);
      }
    }
    // Return empty object to allow operation to proceed
    return Promise.resolve({});
  };
}

/**
 * Create a PostToolUse hook callback.
 *
 * Updates the capture with result and marks as successful.
 *
 * @param captureMap - Map for correlating Pre/Post hooks by toolUseId
 * @returns Hook callback
 */
function createPostToolUseHook(
  captureMap: Map<string, ToolCapture>,
): HookCallback {
  return async (input, toolUseId, _context) => {
    // PostToolUse hooks receive PostToolUseHookInput with tool_response
    if (toolUseId && captureMap.has(toolUseId)) {
      const capture = captureMap.get(toolUseId);
      if (capture && "tool_response" in input) {
        capture.result = input.tool_response;
        capture.success = true;
      }
    }
    return Promise.resolve({});
  };
}

/**
 * Create a PostToolUseFailure hook callback.
 *
 * Updates the capture with error and marks as failed.
 *
 * @param captureMap - Map for correlating Pre/Post hooks by toolUseId
 * @returns Hook callback
 */
function createPostToolUseFailureHook(
  captureMap: Map<string, ToolCapture>,
): HookCallback {
  return async (input, toolUseId, _context) => {
    // PostToolUseFailure hooks receive PostToolUseFailureHookInput with error
    if (toolUseId && captureMap.has(toolUseId)) {
      const capture = captureMap.get(toolUseId);
      if (capture && "error" in input) {
        // TypeScript narrows to PostToolUseFailureHookInput after "error" in input check
        capture.error = input.error;
        capture.success = false;
        if (input.is_interrupt !== undefined) {
          capture.isInterrupt = input.is_interrupt;
        }
      }
    }
    return Promise.resolve({});
  };
}

/**
 * Hook configuration for all hook types.
 */
interface HooksConfig {
  preToolUse: PreToolUseHookConfig[];
  postToolUse: PostToolUseHookConfig[];
  postToolUseFailure: PostToolUseFailureHookConfig[];
}

/**
 * Build query input for scenario execution.
 */
function buildQueryInput(
  scenario: TestScenario,
  plugins: PluginReference[],
  config: ExecutionConfig,
  hooks: HooksConfig,
  abortSignal: AbortSignal,
  startTime: number,
  enableMcpDiscovery: boolean,
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
      ...(config.disallowed_tools
        ? { disallowedTools: config.disallowed_tools }
        : {}),
      model: config.model,
      maxTurns: config.max_turns,
      persistSession: false, // Session isolation
      maxBudgetUsd: config.max_budget_usd,
      abortSignal,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      hooks: {
        PreToolUse: hooks.preToolUse,
        PostToolUse: hooks.postToolUse,
        PostToolUseFailure: hooks.postToolUseFailure,
      },
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
 * Extract metrics from SDK result message.
 */
function extractResultMetrics(messages: SDKMessage[]): {
  costUsd: number;
  durationMs: number;
  numTurns: number;
  permissionDenials: string[];
} {
  const resultMsg = messages.find(isResultMessage);

  return {
    costUsd: resultMsg?.total_cost_usd ?? 0,
    durationMs: resultMsg?.duration_ms ?? 0,
    numTurns: resultMsg?.num_turns ?? 0,
    permissionDenials: resultMsg?.permission_denials ?? [],
  };
}

/**
 * Create error event from exception.
 */
function createErrorEvent(
  error: unknown,
  isTimeout = false,
): TranscriptErrorEvent {
  const message = error instanceof Error ? error.message : String(error);

  return {
    type: "error",
    error_type: isTimeout ? "timeout" : "api_error",
    message,
    timestamp: Date.now(),
    recoverable: false,
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

  const messages: SDKMessage[] = [];
  const detectedTools: ToolCapture[] = [];
  const errors: TranscriptErrorEvent[] = [];

  // Create hook response collector for capturing SDK hook messages
  const hookCollector = createHookResponseCollector();

  // Abort controller for timeout handling
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeout_ms);
  const startTime = Date.now();

  try {
    // Build plugin list
    const plugins: PluginReference[] = [{ type: "local", path: pluginPath }];
    for (const additionalPath of additionalPlugins) {
      plugins.push({ type: "local", path: additionalPath });
    }

    // Create capture hooks with correlation map
    const captureMap = new Map<string, ToolCapture>();
    const preHook = createPreToolUseHook(detectedTools, captureMap);
    const postHook = createPostToolUseHook(captureMap);
    const postFailureHook = createPostToolUseFailureHook(captureMap);

    // Configure hooks for each event type
    const hooksConfig: HooksConfig = {
      preToolUse: [{ matcher: ".*", hooks: [preHook] }],
      postToolUse: [{ matcher: ".*", hooks: [postHook] }],
      postToolUseFailure: [{ matcher: ".*", hooks: [postFailureHook] }],
    };

    // Build query input
    const queryInput = buildQueryInput(
      scenario,
      plugins,
      config,
      hooksConfig,
      controller.signal,
      startTime,
      options.enableMcpDiscovery ?? true,
    );

    // Execute with retry for transient errors
    await withRetry(async () => {
      // Use provided query function or real SDK
      const q = queryFn ? queryFn(queryInput) : executeQuery(queryInput);

      for await (const message of q) {
        messages.push(message);

        // Process message for hook responses
        hookCollector.processMessage(message);

        // Capture errors for transcript
        if (isErrorMessage(message)) {
          errors.push({
            type: "error",
            error_type: "api_error",
            message: message.error ?? "Unknown error",
            timestamp: Date.now(),
            recoverable: false,
          });
        }
      }
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    errors.push(createErrorEvent(err, isTimeout));
  } finally {
    clearTimeout(timeout);
  }

  // Extract metrics from result message
  const metrics = extractResultMetrics(messages);

  // Build transcript context
  const context: TranscriptBuilderContext = {
    scenario,
    pluginName,
    model: config.model,
  };

  return {
    scenario_id: scenario.id,
    transcript: buildTranscript(context, messages, errors),
    detected_tools: detectedTools,
    hook_responses: hookCollector.responses,
    cost_usd: metrics.costUsd,
    api_duration_ms: metrics.durationMs,
    num_turns: metrics.numTurns,
    permission_denials: metrics.permissionDenials,
    errors,
  };
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
    enableMcpDiscovery = true,
  } = options;

  const messages: SDKMessage[] = [];
  const detectedTools: ToolCapture[] = [];
  const errors: TranscriptErrorEvent[] = [];
  let userMessageId: string | undefined;

  // Create hook response collector for capturing SDK hook messages
  const hookCollector = createHookResponseCollector();

  // Abort controller for timeout handling
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeout_ms);

  // Determine settingSources based on MCP discovery option
  const settingSources: SettingSource[] = enableMcpDiscovery ? ["project"] : [];

  try {
    // Build plugin list
    const plugins: PluginReference[] = [{ type: "local", path: pluginPath }];
    for (const additionalPath of additionalPlugins) {
      plugins.push({ type: "local", path: additionalPath });
    }

    // Create capture hook
    const captureMap = new Map<string, ToolCapture>();
    const preHook = createPreToolUseHook(detectedTools, captureMap);
    const postHook = createPostToolUseHook(captureMap);
    const postFailureHook = createPostToolUseFailureHook(captureMap);

    // Build query input with file checkpointing enabled
    const queryInput: QueryInput = {
      prompt: scenario.user_prompt,
      options: {
        plugins,
        settingSources,
        allowedTools: [
          ...(config.allowed_tools ?? []),
          "Skill",
          "SlashCommand",
          "Task",
          "Read",
          "Glob",
          "Grep",
        ],
        ...(config.disallowed_tools
          ? { disallowedTools: config.disallowed_tools }
          : {}),
        model: config.model,
        maxTurns: config.max_turns,
        persistSession: false,
        maxBudgetUsd: config.max_budget_usd,
        abortSignal: controller.signal,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        enableFileCheckpointing: true, // Enable for rewind
        hooks: {
          PreToolUse: [{ matcher: ".*", hooks: [preHook] }],
          PostToolUse: [{ matcher: ".*", hooks: [postHook] }],
          PostToolUseFailure: [{ matcher: ".*", hooks: [postFailureHook] }],
        },
      },
    };

    // Execute with retry
    await withRetry(async () => {
      const q = queryFn ? queryFn(queryInput) : executeQuery(queryInput);

      for await (const message of q) {
        messages.push(message);

        // Process message for hook responses
        hookCollector.processMessage(message);

        // Capture user message ID for potential rewind
        if (isUserMessage(message) && "uuid" in message) {
          userMessageId = message.uuid;
        }

        // Capture errors
        if (isErrorMessage(message)) {
          errors.push({
            type: "error",
            error_type: "api_error",
            message: message.error ?? "Unknown error",
            timestamp: Date.now(),
            recoverable: false,
          });
        }
      }

      // Rewind file changes after execution if we have the Query object
      // The SDK's query() returns an object with rewindFiles method
      if (userMessageId && typeof q.rewindFiles === "function") {
        try {
          await q.rewindFiles(userMessageId);
          logger.debug(`Reverted file changes for scenario: ${scenario.id}`);
        } catch (rewindErr) {
          logger.warn(
            `Failed to rewind files for ${scenario.id}: ${rewindErr instanceof Error ? rewindErr.message : String(rewindErr)}`,
          );
        }
      }
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    errors.push(createErrorEvent(err, isTimeout));
  } finally {
    clearTimeout(timeout);
  }

  // Extract metrics
  const metrics = extractResultMetrics(messages);

  // Build transcript
  const context: TranscriptBuilderContext = {
    scenario,
    pluginName,
    model: config.model,
  };

  return {
    scenario_id: scenario.id,
    transcript: buildTranscript(context, messages, errors),
    detected_tools: detectedTools,
    hook_responses: hookCollector.responses,
    cost_usd: metrics.costUsd,
    api_duration_ms: metrics.durationMs,
    num_turns: metrics.numTurns,
    permission_denials: metrics.permissionDenials,
    errors,
  };
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
