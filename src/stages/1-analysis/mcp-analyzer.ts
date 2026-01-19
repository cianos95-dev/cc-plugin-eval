/**
 * MCP Server Analyzer.
 * Parses .mcp.json files and extracts MCP server components for evaluation.
 */

import { existsSync } from "node:fs";

import { readJson } from "../../utils/file-io.js";
import { logger } from "../../utils/logging.js";
import { extractVariablesFromString } from "../../utils/parsing.js";

import type {
  McpComponent,
  McpConfigFile,
  McpServerConfig,
  McpServerType,
} from "../../types/index.js";

/**
 * Infer the MCP server type from configuration.
 *
 * SECURITY NOTE: The WebSocket URL prefix check (`ws://` or `wss://`) only
 * performs string matching to determine the server type. No network connections
 * are made in this function. The actual WebSocket/HTTP connection (if any)
 * happens in the SDK with proper security controls. Semgrep may flag this as
 * "detect-insecure-websocket" but it's a false positive.
 *
 * @param config - The MCP server configuration
 * @returns The inferred server type
 */
export function inferServerType(config: McpServerConfig): McpServerType {
  // Explicit type takes precedence
  if (config.type) {
    return config.type;
  }

  // If command is present, it's stdio
  if (config.command) {
    return "stdio";
  }

  // If URL is present, infer from URL scheme or default to http
  if (config.url) {
    if (config.url.startsWith("ws://") || config.url.startsWith("wss://")) {
      return "websocket";
    }
    // Default URL-based to http (SSE requires explicit type)
    return "http";
  }

  // Default to stdio for backwards compatibility
  return "stdio";
}

/**
 * Infer whether authentication is required based on configuration.
 *
 * Looks for common auth patterns:
 * - Environment variables with TOKEN, KEY, SECRET, AUTH, OAUTH
 * - Authorization headers
 *
 * @param config - MCP server configuration
 * @returns True if authentication appears to be required
 *
 * @example
 * ```typescript
 * inferAuthRequired({ env: { GITHUB_TOKEN: "..." } });  // true
 * inferAuthRequired({ headers: { Authorization: "Bearer..." } });  // true
 * inferAuthRequired({ command: "npx" });  // false
 * ```
 */
export function inferAuthRequired(config: McpServerConfig): boolean {
  const authPatterns = /TOKEN|KEY|SECRET|AUTH|OAUTH|PASSWORD|CREDENTIAL/i;

  // Check environment variables
  if (config.env) {
    for (const key of Object.keys(config.env)) {
      if (authPatterns.test(key)) {
        return true;
      }
    }
  }

  // Check headers
  if (config.headers) {
    for (const key of Object.keys(config.headers)) {
      if (key.toLowerCase() === "authorization") {
        return true;
      }
      if (authPatterns.test(key)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Extract variable references from object values.
 *
 * Finds all ${VAR} patterns in string values of the object.
 */
function extractVariablesFromObject(
  obj: Record<string, unknown> | undefined,
): string[] {
  if (!obj) {
    return [];
  }

  const vars: string[] = [];
  for (const value of Object.values(obj)) {
    if (typeof value === "string") {
      vars.push(...extractVariablesFromString(value));
    }
  }
  return vars;
}

/**
 * Extract environment variable names from configuration.
 *
 * Extracts both explicit env keys and variables referenced in values
 * (e.g., "${GITHUB_TOKEN}" references GITHUB_TOKEN).
 *
 * @param config - MCP server configuration
 * @returns Array of environment variable names
 *
 * @example
 * ```typescript
 * extractEnvVars({ env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" } });
 * // Returns: ["GITHUB_TOKEN"]
 *
 * extractEnvVars({ headers: { Auth: "Bearer ${API_KEY}" } });
 * // Returns: ["API_KEY"]
 * ```
 */
export function extractEnvVars(config: McpServerConfig): string[] {
  const vars = new Set<string>();

  // Extract explicit env keys
  if (config.env) {
    for (const key of Object.keys(config.env)) {
      vars.add(key);
    }
  }

  // Extract ${VAR} references from headers and env values
  for (const varName of extractVariablesFromObject(config.headers)) {
    vars.add(varName);
  }
  for (const varName of extractVariablesFromObject(config.env)) {
    vars.add(varName);
  }

  return Array.from(vars);
}

/**
 * Generate a description for an MCP server.
 *
 * @param name - Server name
 * @param config - Server configuration
 * @returns Generated description
 */
function generateDescription(name: string, config: McpServerConfig): string {
  const serverType = inferServerType(config);
  const authRequired = inferAuthRequired(config);

  let desc = `MCP server "${name}" (${serverType})`;

  if (config.command) {
    desc += ` via ${config.command}`;
  } else if (config.url) {
    desc += ` at ${config.url}`;
  }

  if (authRequired) {
    desc += " [requires auth]";
  }

  return desc;
}

/**
 * Analyze an .mcp.json file and extract MCP server components.
 *
 * Parses the MCP configuration file, validates the structure,
 * and creates McpComponent entries for each configured server.
 * Tools are initialized as empty arrays - they are discovered
 * at runtime when the SDK connects to the server.
 *
 * @param mcpConfigPath - Absolute path to .mcp.json file
 * @returns Array of parsed MCP server components
 *
 * @example
 * ```typescript
 * const servers = analyzeMcp("/path/to/plugin/mcp/.mcp.json");
 * // Returns:
 * // [
 * //   {
 * //     name: "github",
 * //     path: "/path/to/plugin/mcp/.mcp.json",
 * //     serverType: "stdio",
 * //     command: "npx",
 * //     authRequired: true,
 * //     envVars: ["GITHUB_TOKEN"],
 * //     tools: []
 * //   }
 * // ]
 * ```
 */
export function analyzeMcp(mcpConfigPath: string): McpComponent[] {
  if (!existsSync(mcpConfigPath)) {
    logger.warn(`MCP config file not found: ${mcpConfigPath}`);
    return [];
  }

  let config: McpConfigFile;
  try {
    config = readJson(mcpConfigPath) as McpConfigFile;
  } catch (error) {
    logger.error(`Failed to parse .mcp.json: ${mcpConfigPath}`, { error });
    return [];
  }

  // Validate config structure
  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    logger.warn(`Invalid MCP config structure: ${mcpConfigPath}`);
    return [];
  }

  const components: McpComponent[] = [];

  // Process each server configuration
  for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
    const component: McpComponent = {
      name: serverName,
      path: mcpConfigPath,
      serverType: inferServerType(serverConfig),
      command: serverConfig.command,
      url: serverConfig.url,
      description: generateDescription(serverName, serverConfig),
      authRequired: inferAuthRequired(serverConfig),
      envVars: extractEnvVars(serverConfig),
      tools: [], // Tools are discovered at runtime
    };

    components.push(component);
  }

  logger.info(
    `Analyzed ${String(components.length)} MCP servers from ${mcpConfigPath}`,
  );
  return components;
}

/**
 * Analyze MCP servers from a config path.
 * Wrapper for consistency with other analyzers.
 *
 * @param mcpConfigPath - Path to .mcp.json file
 * @returns Array of parsed MCP server components
 */
export function analyzeMcpServers(mcpConfigPath: string): McpComponent[] {
  return analyzeMcp(mcpConfigPath);
}
