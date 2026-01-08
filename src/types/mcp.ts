/**
 * MCP (Model Context Protocol) server type definitions.
 * Represents MCP server configurations and tool definitions.
 */

/**
 * MCP server transport types.
 */
export type McpServerType = "stdio" | "sse" | "http" | "websocket";

/**
 * MCP tool definition with schema.
 * Represents a tool exposed by an MCP server.
 */
export interface McpToolDefinition {
  /** Tool name */
  name: string;
  /** Tool description */
  description?: string;
  /** JSON schema for tool input parameters */
  inputSchema?: Record<string, unknown>;
}

/**
 * MCP server configuration from .mcp.json.
 * This is the raw configuration before runtime discovery.
 */
export interface McpServerConfig {
  /** Server transport type */
  type?: McpServerType;
  /** Command to run (for stdio type) */
  command?: string;
  /** Command arguments (for stdio type) */
  args?: string[];
  /** Server URL (for sse/http/websocket types) */
  url?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** HTTP headers (for sse/http types) */
  headers?: Record<string, string>;
}

/**
 * Root structure of .mcp.json file.
 */
export interface McpConfigFile {
  /** Server configurations keyed by server name */
  mcpServers?: Record<string, McpServerConfig>;
}

/**
 * Parsed MCP server component for evaluation.
 * Each MCP server becomes a separate component for testing.
 */
export interface McpComponent {
  /** Server name (from config key) */
  name: string;
  /** Path to .mcp.json file */
  path: string;
  /** Server type (stdio, sse, etc.) */
  serverType: McpServerType;
  /** Server command (for stdio) */
  command?: string | undefined;
  /** Server URL (for sse/http/websocket) */
  url?: string | undefined;
  /** Generated description */
  description: string;
  /** Whether authentication appears to be required */
  authRequired: boolean;
  /** Required environment variables */
  envVars: string[];
  /**
   * Tools discovered from server.
   * Note: Full tool list is only available at runtime when SDK connects.
   * This field is populated during Stage 3 execution.
   */
  tools: McpToolDefinition[];
}
