/**
 * Plugin loader for Stage 3: Execution.
 *
 * Verifies plugin loads correctly before running scenarios.
 * Uses Claude Agent SDK to initialize a session and check
 * that the plugin and its components are available.
 */

import { DEFAULT_TUNING } from "../../config/defaults.js";
import {
  MCP_STATUS_NEEDS_AUTH,
  type PluginLoadResult,
  type PluginLoadDiagnostics,
  type McpServerStatus,
  type ExecutionConfig,
  type PluginErrorType,
  type TimingBreakdown,
} from "../../types/index.js";
import { logger } from "../../utils/logging.js";

import {
  executeQuery,
  isSystemMessage,
  isResultMessage,
  getErrorFromMessage,
  type SDKSystemMessage,
  type QueryInput,
  type QueryObject,
  type SettingSource,
} from "./sdk-client.js";

/**
 * Recovery hints for common plugin error types.
 */
const ERROR_RECOVERY_HINTS: Record<string, string> = {
  manifest_not_found: "Ensure plugin.json exists in .claude-plugin/ directory",
  manifest_parse_error: "Check plugin.json for valid JSON syntax",
  manifest_validation: 'Plugin manifest must include "name" field at minimum',
  component_discovery: "Check directory permissions and structure",
  skill_parse_error: "Verify SKILL.md has valid YAML frontmatter",
  agent_parse_error:
    "Verify agent .md has required frontmatter (name, model, color)",
  command_parse_error: "Check command .md frontmatter syntax",
  hook_config_error: "Validate hooks.json against schema",
  mcp_connection_failed: "Check MCP server command/path and dependencies",
  mcp_auth_required: "Configure OAuth or set skip_auth_required: true",
  mcp_timeout: "Increase mcp_servers.connection_timeout_ms in config",
  timeout:
    "Plugin load exceeded timeout. Check for slow MCP servers or increase tuning.timeouts.plugin_load_ms",
  permission_denied: "Check file permissions for plugin directory",
  unknown: "Check logs for detailed error information",
};

/**
 * Get recovery hint for an error type.
 *
 * @param errorType - The error type
 * @returns Recovery suggestion
 */
export function getRecoveryHint(errorType: string): string {
  const hint = ERROR_RECOVERY_HINTS[errorType];
  if (hint !== undefined) {
    return hint;
  }
  return "Check logs for detailed error information";
}

/**
 * Query function type for dependency injection in tests.
 * When provided, this overrides the real SDK.
 */
export type QueryFunction = (input: QueryInput) => QueryObject;

/**
 * Plugin loader options.
 */
export interface PluginLoaderOptions {
  /** Plugin path to load */
  pluginPath: string;
  /** Execution configuration */
  config: ExecutionConfig;
  /** Query function override (for testing) */
  queryFn?: QueryFunction | undefined;
  /** Load timeout in milliseconds */
  timeoutMs?: number | undefined;
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
 * Options for buildPluginQueryInput.
 */
interface BuildPluginQueryInputOptions {
  pluginPath: string;
  config: ExecutionConfig;
  settingSources: SettingSource[];
  controller: AbortController;
  startTime: number;
}

/** Build query input for plugin verification */
function buildPluginQueryInput(
  options: BuildPluginQueryInputOptions,
): QueryInput {
  const { pluginPath, config, settingSources, controller, startTime } = options;
  return {
    prompt: "Plugin initialization check - respond with OK",
    options: {
      plugins: [{ type: "local", path: pluginPath }],
      settingSources,
      model: config.model,
      maxTurns: 1,
      persistSession: false,
      permissionMode: config.permission_bypass
        ? "bypassPermissions"
        : "default",
      allowDangerouslySkipPermissions: config.permission_bypass,
      abortController: controller,
      stderr: (data: string): void => {
        const elapsed = Date.now() - startTime;
        logger.debug(
          `[Plugin Load ${String(elapsed)}ms] SDK stderr: ${data.trim()}`,
        );
      },
    },
  };
}

/** Process messages from query stream looking for init message */
async function processQueryMessages(
  q: QueryObject,
  pluginPath: string,
  timings: PluginLoadTimings,
): Promise<PluginLoadResult> {
  let initResult: PluginLoadResult | null = null;

  for await (const message of q) {
    timings.firstMessage ??= Date.now();

    if (isSystemMessage(message)) {
      timings.initMessage = Date.now();
      initResult = processInitMessage(message, pluginPath, timings);
      await enrichMcpServerStatus(initResult, q);
      // Continue iterating to find result message with cost
      continue;
    }

    // Extract cost from result message
    if (isResultMessage(message)) {
      if (initResult) {
        initResult.load_cost_usd = message.total_cost_usd;
        return initResult;
      }
      // Got result before init - shouldn't happen, but handle gracefully
      return createFailedResult(
        pluginPath,
        "Received result message before init message",
        "unknown",
        timings,
      );
    }

    const errorText = getErrorFromMessage(message);
    if (errorText !== undefined) {
      return createFailedResult(
        pluginPath,
        `Plugin initialization error: ${errorText}`,
        "unknown",
        timings,
      );
    }
  }

  // If we got init but no result, return init with 0 cost
  if (initResult) {
    initResult.load_cost_usd = 0;
    return initResult;
  }

  return createFailedResult(
    pluginPath,
    "No system init message received - plugin may have failed silently",
    "unknown",
    timings,
  );
}

/** Handle errors during plugin load */
function handlePluginLoadError(
  err: unknown,
  pluginPath: string,
  timeoutMs: number,
  timings: PluginLoadTimings,
): PluginLoadResult {
  const isTimeout = err instanceof Error && err.name === "AbortError";
  const errorType: PluginErrorType = isTimeout ? "timeout" : "unknown";
  const errorMessage = isTimeout
    ? `Plugin load timed out after ${String(timeoutMs / 1000)} seconds`
    : `Plugin load failed: ${err instanceof Error ? err.message : String(err)}`;

  return createFailedResult(pluginPath, errorMessage, errorType, timings);
}

/**
 * Verify a plugin loads correctly.
 *
 * Initializes an Agent SDK session with the plugin and verifies
 * that it loaded successfully. Returns detailed diagnostics about
 * what components were discovered.
 *
 * @param options - Plugin loader options
 * @returns Plugin load result with diagnostics
 *
 * @example
 * ```typescript
 * const result = await verifyPluginLoad({
 *   pluginPath: './my-plugin',
 *   config: executionConfig,
 * });
 *
 * if (!result.loaded) {
 *   console.error(`Plugin failed to load: ${result.error}`);
 *   console.log(`Recovery hint: ${result.recovery_hint}`);
 * }
 * ```
 */
export async function verifyPluginLoad(
  options: PluginLoaderOptions,
): Promise<PluginLoadResult> {
  const {
    pluginPath,
    config,
    queryFn,
    timeoutMs = DEFAULT_TUNING.timeouts.plugin_load_ms,
    enableMcpDiscovery = true,
  } = options;
  const startTime = Date.now();

  const timings: PluginLoadTimings = {
    queryStart: startTime,
    firstMessage: null,
    initMessage: null,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const settingSources: SettingSource[] = enableMcpDiscovery ? ["project"] : [];

  // Keep reference for cleanup
  let queryObject: QueryObject | undefined;

  try {
    const queryInput = buildPluginQueryInput({
      pluginPath,
      config,
      settingSources,
      controller,
      startTime,
    });
    const q = queryFn ? queryFn(queryInput) : executeQuery(queryInput);
    queryObject = q;

    return await processQueryMessages(q, pluginPath, timings);
  } catch (err) {
    return handlePluginLoadError(err, pluginPath, timeoutMs, timings);
  } finally {
    // Ensure query cleanup on timeout or error
    queryObject?.close?.();
    clearTimeout(timeout);
  }
}

/**
 * Internal timing state for tracking SDK operation phases.
 */
interface PluginLoadTimings {
  queryStart: number;
  firstMessage: number | null;
  initMessage: number | null;
}

/**
 * Create timing breakdown from timing state.
 */
function createTimingBreakdown(
  timings: PluginLoadTimings,
  queryComplete: number,
): TimingBreakdown {
  return {
    time_to_first_message_ms:
      timings.firstMessage !== null
        ? timings.firstMessage - timings.queryStart
        : queryComplete - timings.queryStart,
    time_to_init_message_ms:
      timings.initMessage !== null
        ? timings.initMessage - timings.queryStart
        : queryComplete - timings.queryStart,
    total_query_time_ms: queryComplete - timings.queryStart,
  };
}

/**
 * Valid MCP server status values.
 * Used to validate SDK responses match our expected type.
 */
const VALID_MCP_STATUSES = new Set<McpServerStatus["status"]>([
  "connected",
  "failed",
  "pending",
  MCP_STATUS_NEEDS_AUTH,
]);

/**
 * Type guard to validate MCP server status from SDK response.
 * Returns true if the status is a known valid status value.
 */
function isValidMcpStatus(status: string): status is McpServerStatus["status"] {
  return VALID_MCP_STATUSES.has(status as McpServerStatus["status"]);
}

/**
 * Enrich MCP server status with real-time data from SDK query.
 * MCP servers may connect asynchronously after init message.
 */
async function enrichMcpServerStatus(
  result: PluginLoadResult,
  queryObj: QueryObject,
): Promise<void> {
  if (!queryObj.mcpServerStatus || result.mcp_servers.length === 0) {
    return;
  }

  try {
    const liveStatus = await queryObj.mcpServerStatus();

    // Update MCP server data with live status and tools
    result.mcp_servers = result.mcp_servers.map((server) => {
      const live = liveStatus[server.name];
      if (!live) {
        return server;
      }

      // Validate status is a known value; if not, keep init message status and log warning
      if (!isValidMcpStatus(live.status)) {
        logger.debug(
          `Unknown MCP server status "${live.status}" for server "${server.name}", keeping init status`,
        );
        return {
          ...server,
          // Always use live tools as the authoritative source for current server state
          tools: live.tools,
        };
      }

      return {
        ...server,
        status: live.status,
        // Always use live tools as the authoritative source for current server state
        tools: live.tools,
      };
    });

    // Add warnings for failed servers
    const failures = result.mcp_servers.filter(
      (s) => s.status === "failed" || s.status === MCP_STATUS_NEEDS_AUTH,
    );
    if (failures.length > 0) {
      result.mcp_warnings = failures.map(
        (s) =>
          `MCP server "${s.name}" ${s.status === MCP_STATUS_NEEDS_AUTH ? "requires authentication" : "failed to connect"}${s.error ? `: ${s.error}` : ""}`,
      );
    }
  } catch (err) {
    // Don't fail plugin load if status query fails
    logger.debug(
      `Failed to query MCP server status: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Process SDK init message to extract plugin information.
 */
function processInitMessage(
  initMsg: SDKSystemMessage,
  pluginPath: string,
  timings: PluginLoadTimings,
): PluginLoadResult {
  // Check if our plugin is in the loaded plugins array
  const loadedPlugins = initMsg.plugins;
  const targetPlugin = loadedPlugins.find(
    (p) => p.path === pluginPath || p.path.endsWith(pluginPath),
  );

  if (!targetPlugin) {
    return createFailedResult(
      pluginPath,
      `Plugin not found in loaded plugins. Expected path: ${pluginPath}`,
      "manifest_not_found",
      timings,
    );
  }

  // Extract MCP server status with detailed tool mapping
  // MCP tools from plugins use pattern: mcp__plugin_<plugin-name>_<server-name>__<tool-name>
  const mcpServers: McpServerStatus[] = initMsg.mcp_servers.map((server) => {
    const pluginServerPrefix = `mcp__plugin_${targetPlugin.name}_${server.name}__`;
    const directServerPrefix = `mcp__${server.name}__`;
    const serverTools = initMsg.tools.filter(
      (t) =>
        t.startsWith(pluginServerPrefix) || t.startsWith(directServerPrefix),
    );

    const result: McpServerStatus = {
      name: server.name,
      status: server.status as McpServerStatus["status"],
      tools: serverTools,
    };

    // SDK may include error field at runtime even though it's not in the type
    const serverWithError = server as {
      name: string;
      status: string;
      error?: string;
    };
    if (server.status === "failed" && serverWithError.error) {
      result.error = serverWithError.error;
    }

    return result;
  });

  // Build diagnostics
  const queryComplete = Date.now();
  const diagnostics: PluginLoadDiagnostics = {
    manifest_found: true,
    manifest_valid: true,
    components_discovered: {
      skills: 0, // Will be filled by analysis stage
      agents: 0,
      commands: initMsg.slash_commands.length,
      hooks: false,
      mcp_servers: mcpServers.length,
    },
    load_duration_ms: queryComplete - timings.queryStart,
    timing_breakdown: createTimingBreakdown(timings, queryComplete),
  };

  return {
    loaded: true,
    plugin_name: targetPlugin.name,
    plugin_path: pluginPath,
    registered_tools: initMsg.tools,
    registered_commands: initMsg.slash_commands,
    registered_skills: initMsg.slash_commands.filter((c) => !c.startsWith("/")),
    registered_agents: [], // Agents aren't listed in init, detected via Task tool usage
    mcp_servers: mcpServers,
    session_id: initMsg.session_id,
    diagnostics,
  };
}

/**
 * Create a failed load result.
 */
function createFailedResult(
  pluginPath: string,
  error: string,
  errorType: PluginErrorType,
  timings: PluginLoadTimings,
): PluginLoadResult {
  const queryComplete = Date.now();
  return {
    loaded: false,
    plugin_name: null,
    plugin_path: pluginPath,
    registered_tools: [],
    registered_commands: [],
    registered_skills: [],
    registered_agents: [],
    mcp_servers: [],
    session_id: "",
    error,
    error_type: errorType,
    recovery_hint: getRecoveryHint(errorType),
    diagnostics: {
      manifest_found: false,
      manifest_valid: false,
      components_discovered: {
        skills: 0,
        agents: 0,
        commands: 0,
        hooks: false,
        mcp_servers: 0,
      },
      load_duration_ms: queryComplete - timings.queryStart,
      timing_breakdown: createTimingBreakdown(timings, queryComplete),
    },
  };
}

/**
 * Check if a plugin load result indicates success.
 *
 * @param result - Plugin load result
 * @returns True if plugin loaded successfully
 */
export function isPluginLoaded(result: PluginLoadResult): boolean {
  return result.loaded && result.plugin_name !== null;
}

/**
 * Check if MCP servers are healthy.
 *
 * @param result - Plugin load result
 * @returns True if all MCP servers are connected
 */
export function areMcpServersHealthy(result: PluginLoadResult): boolean {
  if (result.mcp_servers.length === 0) {
    return true; // No MCP servers = healthy
  }

  return result.mcp_servers.every((s) => s.status === "connected");
}

/**
 * Get failed MCP servers.
 *
 * @param result - Plugin load result
 * @returns List of failed MCP servers
 */
export function getFailedMcpServers(
  result: PluginLoadResult,
): McpServerStatus[] {
  return result.mcp_servers.filter((s) => s.status !== "connected");
}

/**
 * Format MCP servers for display.
 */
function formatMcpServers(servers: McpServerStatus[]): string[] {
  if (servers.length === 0) {
    return [];
  }

  const lines = [`  MCP Servers: ${String(servers.length)}`];
  for (const server of servers) {
    const statusIcon = server.status === "connected" ? "✓" : "✗";
    lines.push(
      `    ${statusIcon} ${server.name}: ${server.status} (${String(server.tools.length)} tools)`,
    );
  }
  return lines;
}

/**
 * Format MCP warnings for display.
 */
function formatMcpWarnings(warnings: string[] | undefined): string[] {
  if (!warnings || warnings.length === 0) {
    return [];
  }

  return [`  MCP Warnings:`, ...warnings.map((w) => `    ⚠ ${w}`)];
}

/**
 * Format diagnostics timing information for display.
 */
function formatDiagnostics(
  diagnostics: PluginLoadDiagnostics | undefined,
): string[] {
  if (!diagnostics) {
    return [];
  }

  const lines = [`  Load time: ${String(diagnostics.load_duration_ms)}ms`];

  if (diagnostics.timing_breakdown) {
    const tb = diagnostics.timing_breakdown;
    lines.push(
      `  Timing breakdown:`,
      `    First message: ${String(tb.time_to_first_message_ms)}ms`,
      `    Init message: ${String(tb.time_to_init_message_ms)}ms`,
      `    Total query: ${String(tb.total_query_time_ms)}ms`,
    );
  }

  return lines;
}

/**
 * Format successful plugin load result.
 */
function formatSuccessResult(result: PluginLoadResult): string[] {
  return [
    `Plugin loaded: ${result.plugin_name ?? "unknown"}`,
    `  Path: ${result.plugin_path}`,
    `  Session: ${result.session_id}`,
    `  Tools: ${String(result.registered_tools.length)}`,
    `  Commands: ${String(result.registered_commands.length)}`,
    ...formatMcpServers(result.mcp_servers),
    ...formatMcpWarnings(result.mcp_warnings),
    ...formatDiagnostics(result.diagnostics),
  ];
}

/**
 * Format failed plugin load result.
 */
function formatFailureResult(result: PluginLoadResult): string[] {
  const lines = [
    `Plugin failed to load: ${result.plugin_path}`,
    `  Error: ${result.error ?? "Unknown"}`,
    `  Type: ${result.error_type ?? "unknown"}`,
  ];

  if (result.recovery_hint) {
    lines.push(`  Hint: ${result.recovery_hint}`);
  }

  return lines;
}

/**
 * Format plugin load result for logging.
 *
 * @param result - Plugin load result
 * @returns Formatted string
 */
export function formatPluginLoadResult(result: PluginLoadResult): string {
  const lines = result.loaded
    ? formatSuccessResult(result)
    : formatFailureResult(result);

  return lines.join("\n");
}

/**
 * Query inspection result for runtime capability checking.
 */
export interface QueryInspectionResult {
  commands: string[];
  mcpStatus: Record<string, { status: string; tools: string[] }>;
  accountInfo?: { tier: string };
}

/**
 * Inspect Query object capabilities at runtime.
 *
 * This function inspects a live Query object to get current
 * command registrations and MCP server status.
 *
 * @param q - Query object from SDK
 * @param _pluginName - Plugin name (for context)
 * @returns Inspection result with commands and MCP status
 */
export async function inspectQueryCapabilities(
  q: {
    supportedCommands?: () => Promise<string[]>;
    mcpServerStatus?: () => Promise<
      Record<string, { status: string; tools: string[] }>
    >;
    accountInfo?: () => Promise<{ tier: string }>;
  },
  _pluginName: string,
): Promise<QueryInspectionResult> {
  // Get all supported commands (verifies command registration)
  const commands = q.supportedCommands ? await q.supportedCommands() : [];

  // Get real-time MCP server status (verifies MCP connectivity)
  const mcpStatus = q.mcpServerStatus ? await q.mcpServerStatus() : {};

  // Optional: Get account info for tier-specific features
  let accountInfo: { tier: string } | undefined;
  if (q.accountInfo) {
    try {
      accountInfo = await q.accountInfo();
    } catch {
      // Account info may not be available in all contexts
    }
  }

  return {
    commands,
    mcpStatus,
    ...(accountInfo ? { accountInfo } : {}),
  };
}
