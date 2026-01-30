/**
 * Plugin-related type definitions.
 * Represents plugin manifests, load results, and component paths.
 */

/**
 * Plugin error types for categorizing failures.
 */
export type PluginErrorType =
  | "manifest_not_found"
  | "manifest_parse_error"
  | "manifest_validation"
  | "component_discovery"
  | "skill_parse_error"
  | "agent_parse_error"
  | "command_parse_error"
  | "hook_config_error"
  | "mcp_connection_failed"
  | "mcp_auth_required"
  | "mcp_timeout"
  | "timeout"
  | "permission_denied"
  | "unknown";

/**
 * MCP server status indicating authentication is required.
 * Co-located with McpServerStatus type for single source of truth.
 */
export const MCP_STATUS_NEEDS_AUTH: McpServerStatus["status"] = "needs-auth";

/**
 * Tool annotations from the SDK's McpServerStatus.
 */
export interface McpToolAnnotations {
  readOnly?: boolean;
  destructive?: boolean;
  openWorld?: boolean;
}

/**
 * Detailed tool information from SDK's McpServerStatus.
 */
export interface McpToolDetail {
  name: string;
  description?: string;
  annotations?: McpToolAnnotations;
}

/**
 * Status of an MCP server connection.
 */
export interface McpServerStatus {
  name: string;
  status: "connected" | "failed" | "pending" | "needs-auth" | "disabled";
  /** Tool names (string list for backward compatibility) */
  tools: string[];
  error?: string;
  /** Server info from the MCP protocol (available when connected) */
  serverInfo?: { name: string; version: string } | undefined;
  /** Configuration scope (e.g., project, user, local) */
  scope?: string | undefined;
  /** Detailed tool metadata including descriptions and annotations */
  toolDetails?: McpToolDetail[] | undefined;
}

/**
 * Timing breakdown for SDK operations.
 */
export interface TimingBreakdown {
  /** Time from query start to first message */
  time_to_first_message_ms: number;
  /** Time from query start to init message */
  time_to_init_message_ms: number;
  /** Total query execution time */
  total_query_time_ms: number;
}

/**
 * Diagnostic information about plugin loading.
 */
export interface PluginLoadDiagnostics {
  manifest_found: boolean;
  manifest_valid: boolean;
  components_discovered: {
    skills: number;
    agents: number;
    commands: number;
    hooks: boolean;
    mcp_servers: number;
  };
  load_duration_ms: number;
  /** Detailed timing breakdown for SDK operations */
  timing_breakdown?: TimingBreakdown;
}

/**
 * Result of attempting to load a plugin.
 */
export interface PluginLoadResult {
  loaded: boolean;
  plugin_name: string | null;
  plugin_path: string;
  registered_tools: string[];
  registered_commands: string[];
  registered_skills: string[];
  registered_agents: string[];
  mcp_servers: McpServerStatus[];
  mcp_warnings?: string[];
  session_id: string;
  error?: string;
  error_type?: PluginErrorType;
  recovery_hint?: string;
  diagnostics?: PluginLoadDiagnostics;
  /**
   * Cost of the plugin load API call in USD.
   * Extracted from the SDK's result message for the plugin verification call.
   */
  load_cost_usd?: number;
}

/**
 * Plugin manifest (plugin.json) structure.
 */
export interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  commands?: string | string[];
  agents?: string | string[];
  hooks?: string;
  mcpServers?: string;
}

/**
 * Resolved component paths from plugin manifest.
 */
export interface ResolvedPaths {
  commands: string[];
  agents: string[];
  skills: string[];
  hooks: string | null;
  mcpServers: string | null;
}

/**
 * Preflight validation error.
 */
export interface PreflightError {
  code:
    | "PATH_NOT_FOUND"
    | "PATH_RESOLUTION_FAILED"
    | "PATH_DANGEROUS"
    | "MANIFEST_NOT_FOUND"
    | "MANIFEST_PARSE_ERROR"
    | "MANIFEST_INVALID";
  message: string;
  suggestion: string;
}

/**
 * Preflight validation warning.
 */
export interface PreflightWarning {
  code: string;
  message: string;
}

/**
 * Result of preflight validation.
 */
export interface PreflightResult {
  valid: boolean;
  pluginPath: string;
  resolvedPath: string;
  manifestPath: string;
  pluginName: string | null;
  errors: PreflightError[];
  warnings: PreflightWarning[];
}
