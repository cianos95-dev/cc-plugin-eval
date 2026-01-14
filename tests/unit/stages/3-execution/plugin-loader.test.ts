/**
 * Unit tests for plugin-loader.ts
 */

import { describe, expect, it } from "vitest";

import {
  getRecoveryHint,
  isPluginLoaded,
  areMcpServersHealthy,
  getFailedMcpServers,
  formatPluginLoadResult,
  verifyPluginLoad,
  type QueryFunction,
} from "../../../../src/stages/3-execution/plugin-loader.js";
import type {
  PluginLoadResult,
  ExecutionConfig,
} from "../../../../src/types/index.js";
import type {
  SDKMessage,
  SDKSystemMessage,
  QueryInput,
} from "../../../../src/stages/3-execution/sdk-client.js";

describe("getRecoveryHint", () => {
  it("should return hint for known error types", () => {
    expect(getRecoveryHint("manifest_not_found")).toContain("plugin.json");
    expect(getRecoveryHint("timeout")).toContain(
      "tuning.timeouts.plugin_load_ms",
    );
    expect(getRecoveryHint("mcp_connection_failed")).toContain("MCP server");
  });

  it("should return default hint for unknown error types", () => {
    const hint = getRecoveryHint("some_unknown_error");

    expect(hint).toContain("logs");
  });
});

describe("isPluginLoaded", () => {
  it("should return true for loaded plugin", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "test-plugin",
      plugin_path: "/path/to/plugin",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [],
      session_id: "session-123",
    };

    expect(isPluginLoaded(result)).toBe(true);
  });

  it("should return false for failed plugin", () => {
    const result: PluginLoadResult = {
      loaded: false,
      plugin_name: null,
      plugin_path: "/path/to/plugin",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [],
      session_id: "",
      error: "Plugin not found",
    };

    expect(isPluginLoaded(result)).toBe(false);
  });

  it("should return false when loaded but no plugin name", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: null,
      plugin_path: "/path/to/plugin",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [],
      session_id: "",
    };

    expect(isPluginLoaded(result)).toBe(false);
  });
});

describe("areMcpServersHealthy", () => {
  it("should return true when no MCP servers", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "test",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [],
      session_id: "",
    };

    expect(areMcpServersHealthy(result)).toBe(true);
  });

  it("should return true when all servers connected", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "test",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [
        { name: "github", status: "connected", tools: [] },
        { name: "postgres", status: "connected", tools: [] },
      ],
      session_id: "",
    };

    expect(areMcpServersHealthy(result)).toBe(true);
  });

  it("should return false when any server failed", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "test",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [
        { name: "github", status: "connected", tools: [] },
        {
          name: "postgres",
          status: "failed",
          tools: [],
          error: "Connection refused",
        },
      ],
      session_id: "",
    };

    expect(areMcpServersHealthy(result)).toBe(false);
  });

  it("should return false when server needs auth", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "test",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [{ name: "github", status: "needs-auth", tools: [] }],
      session_id: "",
    };

    expect(areMcpServersHealthy(result)).toBe(false);
  });
});

describe("getFailedMcpServers", () => {
  it("should return empty array when all healthy", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "test",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [{ name: "github", status: "connected", tools: [] }],
      session_id: "",
    };

    expect(getFailedMcpServers(result)).toEqual([]);
  });

  it("should return failed servers", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "test",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [
        { name: "github", status: "connected", tools: [] },
        {
          name: "postgres",
          status: "failed",
          tools: [],
          error: "Connection refused",
        },
        { name: "slack", status: "needs-auth", tools: [] },
      ],
      session_id: "",
    };

    const failed = getFailedMcpServers(result);

    expect(failed).toHaveLength(2);
    expect(failed.map((s) => s.name)).toEqual(["postgres", "slack"]);
  });
});

describe("formatPluginLoadResult", () => {
  it("should format successful load result", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "my-plugin",
      plugin_path: "/path/to/plugin",
      registered_tools: ["Skill", "Read", "Write"],
      registered_commands: ["/commit", "/review"],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [],
      session_id: "session-abc",
      diagnostics: {
        manifest_found: true,
        manifest_valid: true,
        components_discovered: {
          skills: 2,
          agents: 1,
          commands: 2,
          hooks: false,
          mcp_servers: 0,
        },
        load_duration_ms: 150,
      },
    };

    const formatted = formatPluginLoadResult(result);

    expect(formatted).toContain("my-plugin");
    expect(formatted).toContain("/path/to/plugin");
    expect(formatted).toContain("session-abc");
    expect(formatted).toContain("3"); // tools
    expect(formatted).toContain("2"); // commands
    expect(formatted).toContain("150ms");
  });

  it("should format failed load result", () => {
    const result: PluginLoadResult = {
      loaded: false,
      plugin_name: null,
      plugin_path: "/path/to/plugin",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [],
      session_id: "",
      error: "Plugin manifest not found",
      error_type: "manifest_not_found",
      recovery_hint: "Check plugin.json exists",
    };

    const formatted = formatPluginLoadResult(result);

    expect(formatted).toContain("failed to load");
    expect(formatted).toContain("Plugin manifest not found");
    expect(formatted).toContain("manifest_not_found");
    expect(formatted).toContain("Check plugin.json exists");
  });

  it("should format result with MCP servers", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "mcp-plugin",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [
        {
          name: "github",
          status: "connected",
          tools: ["create_issue", "list_repos"],
        },
        {
          name: "postgres",
          status: "failed",
          tools: [],
          error: "Connection refused",
        },
      ],
      session_id: "",
    };

    const formatted = formatPluginLoadResult(result);

    expect(formatted).toContain("MCP Servers: 2");
    expect(formatted).toContain("github");
    expect(formatted).toContain("connected");
    expect(formatted).toContain("2 tools");
    expect(formatted).toContain("postgres");
    expect(formatted).toContain("failed");
  });

  it("should format result with timing breakdown", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "my-plugin",
      plugin_path: "/path/to/plugin",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [],
      session_id: "session-abc",
      diagnostics: {
        manifest_found: true,
        manifest_valid: true,
        components_discovered: {
          skills: 2,
          agents: 1,
          commands: 2,
          hooks: false,
          mcp_servers: 0,
        },
        load_duration_ms: 150,
        timing_breakdown: {
          time_to_first_message_ms: 50,
          time_to_init_message_ms: 120,
          total_query_time_ms: 150,
        },
      },
    };

    const formatted = formatPluginLoadResult(result);

    expect(formatted).toContain("Timing breakdown:");
    expect(formatted).toContain("First message: 50ms");
    expect(formatted).toContain("Init message: 120ms");
    expect(formatted).toContain("Total query: 150ms");
  });
});

describe("verifyPluginLoad timing", () => {
  const mockConfig: ExecutionConfig = {
    model: "claude-sonnet-4-20250514",
    session_strategy: "per_scenario",
    allowed_tools: [],
    disallowed_tools: [],
    mcp_servers: {
      skip_auth_required: true,
      connection_timeout_ms: 5000,
    },
  };

  /**
   * Create a mock query function that yields messages with configurable delays.
   */
  function createMockQueryFn(
    messages: SDKMessage[],
    delays: number[] = [],
  ): QueryFunction {
    return (_input: QueryInput) => {
      let index = 0;

      return {
        async *[Symbol.asyncIterator]() {
          for (const message of messages) {
            if (delays[index]) {
              await new Promise((resolve) =>
                setTimeout(resolve, delays[index]),
              );
            }
            index++;
            yield message;
          }
        },
      };
    };
  }

  it("should capture timing breakdown on successful load", async () => {
    const initMessage: SDKSystemMessage = {
      type: "system",
      subtype: "init",
      session_id: "test-session",
      tools: [],
      slash_commands: [],
      plugins: [{ name: "test-plugin", path: "/path/to/plugin" }],
      mcp_servers: [],
    };

    const mockQueryFn = createMockQueryFn([initMessage], [50]);

    const result = await verifyPluginLoad({
      pluginPath: "/path/to/plugin",
      config: mockConfig,
      queryFn: mockQueryFn,
    });

    expect(result.loaded).toBe(true);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics?.timing_breakdown).toBeDefined();
    expect(
      result.diagnostics?.timing_breakdown?.time_to_first_message_ms,
    ).toBeGreaterThanOrEqual(0);
    expect(
      result.diagnostics?.timing_breakdown?.time_to_init_message_ms,
    ).toBeGreaterThanOrEqual(0);
    expect(
      result.diagnostics?.timing_breakdown?.total_query_time_ms,
    ).toBeGreaterThanOrEqual(0);
  });

  it("should capture timing breakdown when init message comes after other messages", async () => {
    const preInitMessage: SDKMessage = {
      type: "assistant",
      message: { role: "assistant", content: [] },
    };

    const initMessage: SDKSystemMessage = {
      type: "system",
      subtype: "init",
      session_id: "test-session",
      tools: [],
      slash_commands: [],
      plugins: [{ name: "test-plugin", path: "/path/to/plugin" }],
      mcp_servers: [],
    };

    const mockQueryFn = createMockQueryFn(
      [preInitMessage, initMessage],
      [20, 30],
    );

    const result = await verifyPluginLoad({
      pluginPath: "/path/to/plugin",
      config: mockConfig,
      queryFn: mockQueryFn,
    });

    expect(result.loaded).toBe(true);
    expect(result.diagnostics?.timing_breakdown).toBeDefined();
    // First message should arrive before init message
    expect(
      result.diagnostics!.timing_breakdown!.time_to_init_message_ms,
    ).toBeGreaterThanOrEqual(
      result.diagnostics!.timing_breakdown!.time_to_first_message_ms,
    );
  });

  it("should capture timing breakdown on failed load", async () => {
    const errorMessage: SDKMessage = {
      type: "error",
      error: "Plugin initialization failed",
    };

    const mockQueryFn = createMockQueryFn([errorMessage], [10]);

    const result = await verifyPluginLoad({
      pluginPath: "/path/to/plugin",
      config: mockConfig,
      queryFn: mockQueryFn,
    });

    expect(result.loaded).toBe(false);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics?.timing_breakdown).toBeDefined();
    expect(
      result.diagnostics?.timing_breakdown?.time_to_first_message_ms,
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("verifyPluginLoad MCP discovery configuration", () => {
  const mockConfig: ExecutionConfig = {
    model: "claude-sonnet-4-20250514",
    session_strategy: "per_scenario",
    allowed_tools: [],
    disallowed_tools: [],
    mcp_servers: {
      skip_auth_required: true,
      connection_timeout_ms: 5000,
    },
  };

  /**
   * Create a mock query function that captures the query input.
   */
  function createCapturingMockQueryFn(
    capturedInputs: QueryInput[],
  ): QueryFunction {
    return (input: QueryInput) => {
      capturedInputs.push(input);

      // Return a mock query object with successful init message
      const initMessage: SDKSystemMessage = {
        type: "system",
        subtype: "init",
        session_id: "test-session",
        tools: [],
        slash_commands: [],
        plugins: [{ name: "test-plugin", path: "/path/to/plugin" }],
        mcp_servers: [],
      };

      return {
        async *[Symbol.asyncIterator]() {
          yield initMessage;
        },
      };
    };
  }

  it("should set settingSources to ['project'] when enableMcpDiscovery is true", async () => {
    const capturedInputs: QueryInput[] = [];
    const mockQueryFn = createCapturingMockQueryFn(capturedInputs);

    await verifyPluginLoad({
      pluginPath: "/path/to/plugin",
      config: mockConfig,
      queryFn: mockQueryFn,
      enableMcpDiscovery: true,
    });

    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0].options?.settingSources).toEqual(["project"]);
  });

  it("should set settingSources to [] when enableMcpDiscovery is false", async () => {
    const capturedInputs: QueryInput[] = [];
    const mockQueryFn = createCapturingMockQueryFn(capturedInputs);

    await verifyPluginLoad({
      pluginPath: "/path/to/plugin",
      config: mockConfig,
      queryFn: mockQueryFn,
      enableMcpDiscovery: false,
    });

    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0].options?.settingSources).toEqual([]);
  });

  it("should default to settingSources ['project'] when enableMcpDiscovery is not specified", async () => {
    const capturedInputs: QueryInput[] = [];
    const mockQueryFn = createCapturingMockQueryFn(capturedInputs);

    await verifyPluginLoad({
      pluginPath: "/path/to/plugin",
      config: mockConfig,
      queryFn: mockQueryFn,
      // enableMcpDiscovery not specified - should default to true
    });

    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0].options?.settingSources).toEqual(["project"]);
  });
});

describe("formatPluginLoadResult with MCP warnings", () => {
  it("should format result with MCP warnings", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "mcp-plugin",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [
        {
          name: "github",
          status: "connected",
          tools: ["create_issue"],
        },
        {
          name: "postgres",
          status: "failed",
          tools: [],
          error: "Connection refused",
        },
      ],
      mcp_warnings: [
        'MCP server "postgres" failed to connect: Connection refused',
      ],
      session_id: "",
    };

    const formatted = formatPluginLoadResult(result);

    expect(formatted).toContain("MCP Warnings:");
    expect(formatted).toContain("postgres");
    expect(formatted).toContain("failed to connect");
  });

  it("should not show MCP Warnings section when no warnings", () => {
    const result: PluginLoadResult = {
      loaded: true,
      plugin_name: "mcp-plugin",
      plugin_path: "/path",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [
        {
          name: "github",
          status: "connected",
          tools: ["create_issue"],
        },
      ],
      session_id: "",
    };

    const formatted = formatPluginLoadResult(result);

    expect(formatted).not.toContain("MCP Warnings:");
  });
});

describe("verifyPluginLoad real-time MCP status validation", () => {
  const mockConfig: ExecutionConfig = {
    model: "claude-sonnet-4-20250514",
    session_strategy: "per_scenario",
    allowed_tools: [],
    disallowed_tools: [],
    mcp_servers: {
      skip_auth_required: true,
      connection_timeout_ms: 5000,
    },
  };

  /**
   * Create a mock query function that supports mcpServerStatus method.
   */
  function createMockQueryFnWithMcpStatus(
    initMessage: SDKSystemMessage,
    liveStatus: Record<string, { status: string; tools: string[] }>,
  ): QueryFunction {
    return (_input: QueryInput) => {
      return {
        async *[Symbol.asyncIterator]() {
          yield initMessage;
        },
        mcpServerStatus: async () => liveStatus,
      };
    };
  }

  it("should update MCP server status from real-time query", async () => {
    const initMessage: SDKSystemMessage = {
      type: "system",
      subtype: "init",
      session_id: "test-session",
      tools: ["mcp__github__create_issue"],
      slash_commands: [],
      plugins: [{ name: "test-plugin", path: "/path/to/plugin" }],
      mcp_servers: [
        {
          name: "github",
          status: "pending", // Init message shows pending
        },
      ],
    };

    const liveStatus = {
      github: {
        status: "connected", // Real-time status shows connected
        tools: ["mcp__github__create_issue", "mcp__github__list_repos"],
      },
    };

    const mockQueryFn = createMockQueryFnWithMcpStatus(initMessage, liveStatus);

    const result = await verifyPluginLoad({
      pluginPath: "/path/to/plugin",
      config: mockConfig,
      queryFn: mockQueryFn,
    });

    expect(result.loaded).toBe(true);
    expect(result.mcp_servers).toHaveLength(1);
    expect(result.mcp_servers[0].status).toBe("connected");
    expect(result.mcp_servers[0].tools).toEqual([
      "mcp__github__create_issue",
      "mcp__github__list_repos",
    ]);
  });

  it("should add mcp_warnings for failed servers after real-time check", async () => {
    const initMessage: SDKSystemMessage = {
      type: "system",
      subtype: "init",
      session_id: "test-session",
      tools: ["mcp__github__create_issue"],
      slash_commands: [],
      plugins: [{ name: "test-plugin", path: "/path/to/plugin" }],
      mcp_servers: [
        {
          name: "github",
          status: "pending",
        },
        {
          name: "postgres",
          status: "pending",
        },
      ],
    };

    const liveStatus = {
      github: {
        status: "connected",
        tools: ["mcp__github__create_issue"],
      },
      postgres: {
        status: "failed",
        tools: [],
      },
    };

    const mockQueryFn = createMockQueryFnWithMcpStatus(initMessage, liveStatus);

    const result = await verifyPluginLoad({
      pluginPath: "/path/to/plugin",
      config: mockConfig,
      queryFn: mockQueryFn,
    });

    expect(result.loaded).toBe(true);
    expect(result.mcp_servers).toHaveLength(2);
    expect(result.mcp_servers[0].status).toBe("connected");
    expect(result.mcp_servers[1].status).toBe("failed");
    expect(result.mcp_warnings).toBeDefined();
    expect(result.mcp_warnings).toHaveLength(1);
    expect(result.mcp_warnings![0]).toContain("postgres");
    expect(result.mcp_warnings![0]).toContain("failed to connect");
  });

  it("should add mcp_warnings for servers requiring auth", async () => {
    const initMessage: SDKSystemMessage = {
      type: "system",
      subtype: "init",
      session_id: "test-session",
      tools: [],
      slash_commands: [],
      plugins: [{ name: "test-plugin", path: "/path/to/plugin" }],
      mcp_servers: [
        {
          name: "slack",
          status: "pending",
        },
      ],
    };

    const liveStatus = {
      slack: {
        status: "needs-auth",
        tools: [],
      },
    };

    const mockQueryFn = createMockQueryFnWithMcpStatus(initMessage, liveStatus);

    const result = await verifyPluginLoad({
      pluginPath: "/path/to/plugin",
      config: mockConfig,
      queryFn: mockQueryFn,
    });

    expect(result.loaded).toBe(true);
    expect(result.mcp_warnings).toBeDefined();
    expect(result.mcp_warnings).toHaveLength(1);
    expect(result.mcp_warnings![0]).toContain("slack");
    expect(result.mcp_warnings![0]).toContain("requires authentication");
  });

  it("should not fail if mcpServerStatus throws an error", async () => {
    const initMessage: SDKSystemMessage = {
      type: "system",
      subtype: "init",
      session_id: "test-session",
      tools: ["mcp__github__create_issue"],
      slash_commands: [],
      plugins: [{ name: "test-plugin", path: "/path/to/plugin" }],
      mcp_servers: [
        {
          name: "github",
          status: "connected",
        },
      ],
    };

    const mockQueryFn: QueryFunction = (_input: QueryInput) => {
      return {
        async *[Symbol.asyncIterator]() {
          yield initMessage;
        },
        mcpServerStatus: async () => {
          throw new Error("Network error");
        },
      };
    };

    const result = await verifyPluginLoad({
      pluginPath: "/path/to/plugin",
      config: mockConfig,
      queryFn: mockQueryFn,
    });

    // Should still return the init message status
    expect(result.loaded).toBe(true);
    expect(result.mcp_servers).toHaveLength(1);
    expect(result.mcp_servers[0].status).toBe("connected");
  });

  it("should skip mcpServerStatus call when no MCP servers in init", async () => {
    let mcpStatusCalled = false;
    const initMessage: SDKSystemMessage = {
      type: "system",
      subtype: "init",
      session_id: "test-session",
      tools: [],
      slash_commands: [],
      plugins: [{ name: "test-plugin", path: "/path/to/plugin" }],
      mcp_servers: [], // No MCP servers
    };

    const mockQueryFn: QueryFunction = (_input: QueryInput) => {
      return {
        async *[Symbol.asyncIterator]() {
          yield initMessage;
        },
        mcpServerStatus: async () => {
          mcpStatusCalled = true;
          return {};
        },
      };
    };

    const result = await verifyPluginLoad({
      pluginPath: "/path/to/plugin",
      config: mockConfig,
      queryFn: mockQueryFn,
    });

    expect(result.loaded).toBe(true);
    expect(mcpStatusCalled).toBe(false);
  });

  it("should keep init status when live status is unknown/invalid", async () => {
    const initMessage: SDKSystemMessage = {
      type: "system",
      subtype: "init",
      session_id: "test-session",
      tools: ["mcp__github__create_issue"],
      slash_commands: [],
      plugins: [{ name: "test-plugin", path: "/path/to/plugin" }],
      mcp_servers: [
        {
          name: "github",
          status: "connected", // Init shows connected
        },
      ],
    };

    const liveStatus = {
      github: {
        status: "unknown_future_status", // Unknown status from future SDK
        tools: ["mcp__github__create_issue", "mcp__github__new_tool"],
      },
    };

    const mockQueryFn = createMockQueryFnWithMcpStatus(initMessage, liveStatus);

    const result = await verifyPluginLoad({
      pluginPath: "/path/to/plugin",
      config: mockConfig,
      queryFn: mockQueryFn,
    });

    expect(result.loaded).toBe(true);
    expect(result.mcp_servers).toHaveLength(1);
    // Should keep init status "connected" since live status is unknown
    expect(result.mcp_servers[0].status).toBe("connected");
    // But should still use live tools
    expect(result.mcp_servers[0].tools).toEqual([
      "mcp__github__create_issue",
      "mcp__github__new_tool",
    ]);
  });
});
