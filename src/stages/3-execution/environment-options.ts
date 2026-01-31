/**
 * Environment options helpers for Stage 3: Execution.
 *
 * Maps user-facing snake_case config to SDK camelCase options
 * for sandbox, env, cwd, and additionalDirectories.
 */

import type { QueryOptions } from "./sdk-client.js";
import type {
  ExecutionConfig,
  SandboxConfig,
  SandboxNetworkConfig,
} from "../../types/config.js";
import type { SandboxSettings } from "@anthropic-ai/claude-agent-sdk";

/**
 * Maps snake_case SandboxNetworkConfig to camelCase SDK network config.
 */
function buildNetworkOptions(
  network: SandboxNetworkConfig,
): NonNullable<SandboxSettings["network"]> {
  return {
    ...(network.allowed_domains
      ? { allowedDomains: network.allowed_domains }
      : {}),
    ...(network.allow_unix_sockets
      ? { allowUnixSockets: network.allow_unix_sockets }
      : {}),
    ...(network.allow_all_unix_sockets !== undefined
      ? { allowAllUnixSockets: network.allow_all_unix_sockets }
      : {}),
    ...(network.allow_local_binding !== undefined
      ? { allowLocalBinding: network.allow_local_binding }
      : {}),
    ...(network.http_proxy_port !== undefined
      ? { httpProxyPort: network.http_proxy_port }
      : {}),
    ...(network.socks_proxy_port !== undefined
      ? { socksProxyPort: network.socks_proxy_port }
      : {}),
  };
}

/**
 * Maps snake_case SandboxConfig to camelCase SDK SandboxSettings.
 * Returns undefined when sandbox is not configured.
 */
export function buildSandboxOptions(
  sandbox: SandboxConfig | undefined,
): SandboxSettings | undefined {
  if (!sandbox) {
    return undefined;
  }

  return {
    ...(sandbox.enabled !== undefined ? { enabled: sandbox.enabled } : {}),
    ...(sandbox.auto_allow_bash_if_sandboxed !== undefined
      ? { autoAllowBashIfSandboxed: sandbox.auto_allow_bash_if_sandboxed }
      : {}),
    ...(sandbox.allow_unsandboxed_commands !== undefined
      ? { allowUnsandboxedCommands: sandbox.allow_unsandboxed_commands }
      : {}),
    ...(sandbox.network
      ? { network: buildNetworkOptions(sandbox.network) }
      : {}),
    ...(sandbox.ignore_violations
      ? { ignoreViolations: sandbox.ignore_violations }
      : {}),
    ...(sandbox.enable_weaker_nested_sandbox !== undefined
      ? { enableWeakerNestedSandbox: sandbox.enable_weaker_nested_sandbox }
      : {}),
    ...(sandbox.excluded_commands
      ? { excludedCommands: sandbox.excluded_commands }
      : {}),
    ...(sandbox.ripgrep ? { ripgrep: sandbox.ripgrep } : {}),
  };
}

/**
 * Builds environment-related query options from execution config.
 * Returns a spread-ready partial object with sandbox, env, cwd, and additionalDirectories.
 */
export function buildEnvironmentOptions(
  config: ExecutionConfig,
): Partial<QueryOptions> {
  const sandbox = buildSandboxOptions(config.sandbox);

  return {
    ...(sandbox ? { sandbox } : {}),
    ...(config.env ? { env: config.env } : {}),
    ...(config.cwd ? { cwd: config.cwd } : {}),
    ...(config.additional_directories
      ? { additionalDirectories: config.additional_directories }
      : {}),
  };
}
