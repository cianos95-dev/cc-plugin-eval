/**
 * Tests for environment-options.ts helpers.
 */

import { describe, expect, it } from "vitest";

import {
  buildSandboxOptions,
  buildEnvironmentOptions,
} from "../../../../src/stages/3-execution/environment-options.js";

import type {
  ExecutionConfig,
  SandboxConfig,
} from "../../../../src/types/index.js";

describe("buildSandboxOptions", () => {
  it("returns undefined when sandbox is undefined", () => {
    expect(buildSandboxOptions(undefined)).toBeUndefined();
  });

  it("maps all top-level fields from snake_case to camelCase", () => {
    const config: SandboxConfig = {
      enabled: true,
      auto_allow_bash_if_sandboxed: true,
      allow_unsandboxed_commands: false,
      enable_weaker_nested_sandbox: true,
      excluded_commands: ["rm", "sudo"],
    };

    const result = buildSandboxOptions(config);

    expect(result).toEqual({
      enabled: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,
      enableWeakerNestedSandbox: true,
      excludedCommands: ["rm", "sudo"],
    });
  });

  it("maps network sub-config fields", () => {
    const config: SandboxConfig = {
      network: {
        allowed_domains: ["example.com"],
        allow_unix_sockets: ["/tmp/sock"],
        allow_all_unix_sockets: true,
        allow_local_binding: false,
        http_proxy_port: 8080,
        socks_proxy_port: 1080,
      },
    };

    const result = buildSandboxOptions(config);

    expect(result).toEqual({
      network: {
        allowedDomains: ["example.com"],
        allowUnixSockets: ["/tmp/sock"],
        allowAllUnixSockets: true,
        allowLocalBinding: false,
        httpProxyPort: 8080,
        socksProxyPort: 1080,
      },
    });
  });

  it("maps ignore_violations field", () => {
    const config: SandboxConfig = {
      ignore_violations: { bash: ["echo"] },
    };

    const result = buildSandboxOptions(config);

    expect(result).toEqual({
      ignoreViolations: { bash: ["echo"] },
    });
  });

  it("maps ripgrep field (already camelCase in SDK)", () => {
    const config: SandboxConfig = {
      ripgrep: { command: "/usr/bin/rg", args: ["--no-heading"] },
    };

    const result = buildSandboxOptions(config);

    expect(result).toEqual({
      ripgrep: { command: "/usr/bin/rg", args: ["--no-heading"] },
    });
  });

  it("only includes set fields in partial config", () => {
    const config: SandboxConfig = {
      enabled: true,
    };

    const result = buildSandboxOptions(config);

    expect(result).toEqual({ enabled: true });
    expect(result).not.toHaveProperty("autoAllowBashIfSandboxed");
    expect(result).not.toHaveProperty("network");
  });

  it("maps partial network config (only some fields set)", () => {
    const config: SandboxConfig = {
      network: {
        allowed_domains: ["api.example.com"],
      },
    };

    const result = buildSandboxOptions(config);

    expect(result).toEqual({
      network: {
        allowedDomains: ["api.example.com"],
      },
    });
    expect(result?.network).not.toHaveProperty("allowUnixSockets");
  });
});

describe("buildEnvironmentOptions", () => {
  const baseConfig: ExecutionConfig = {
    model: "claude-sonnet-4-20250514",
    max_turns: 5,
    timeout_ms: 60000,
    max_budget_usd: 10.0,
    session_isolation: false,
    permission_bypass: true,
    disallowed_tools: ["Write", "Edit", "Bash"],
    num_reps: 1,
    additional_plugins: [],
  };

  it("returns empty object when no environment options are configured", () => {
    const result = buildEnvironmentOptions(baseConfig);

    expect(result).toEqual({});
  });

  it("includes all 4 keys when fully configured", () => {
    const config: ExecutionConfig = {
      ...baseConfig,
      sandbox: { enabled: true },
      env: { NODE_ENV: "test" },
      cwd: "/tmp/workdir",
      additional_directories: ["/extra/dir"],
    };

    const result = buildEnvironmentOptions(config);

    expect(result).toHaveProperty("sandbox");
    expect(result.sandbox).toEqual({ enabled: true });
    expect(result.env).toEqual({ NODE_ENV: "test" });
    expect(result.cwd).toBe("/tmp/workdir");
    expect(result.additionalDirectories).toEqual(["/extra/dir"]);
  });

  it("maps additional_directories to camelCase additionalDirectories", () => {
    const config: ExecutionConfig = {
      ...baseConfig,
      additional_directories: ["/a", "/b"],
    };

    const result = buildEnvironmentOptions(config);

    expect(result).toEqual({ additionalDirectories: ["/a", "/b"] });
  });

  it("excludes sandbox key when sandbox is undefined", () => {
    const config: ExecutionConfig = {
      ...baseConfig,
      env: { FOO: "bar" },
    };

    const result = buildEnvironmentOptions(config);

    expect(result).not.toHaveProperty("sandbox");
    expect(result.env).toEqual({ FOO: "bar" });
  });
});
