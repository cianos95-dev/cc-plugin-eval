/**
 * Mock SDK factory for Stage 3 integration tests.
 *
 * Provides mock implementations of the Agent SDK query function
 * to enable deterministic testing without real API calls.
 */

import type { QueryFunction } from "../../src/stages/3-execution/agent-executor.js";
import type {
  SDKMessage,
  SDKSystemMessage,
  SDKUserMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKErrorMessage,
  SDKToolResultMessage,
  SDKPermissionDenial,
  Query,
  QueryInput,
  PreToolUseHookConfig,
  SubagentStartHookConfig,
  SubagentStopHookConfig,
  SlashCommand,
  AccountInfo,
  RewindFilesResult,
  SDKMcpServerStatus,
} from "../../src/stages/3-execution/sdk-client.js";
import type { ExecutionConfig } from "../../src/types/index.js";

/**
 * Tool invocation configuration for mock responses.
 */
interface MockToolCall {
  name: string;
  input: unknown;
  id?: string;
}

/**
 * Subagent spawn configuration for mock responses.
 */
interface MockSubagentSpawn {
  agentId: string;
  agentType: string;
}

/**
 * Configuration for creating mock query functions.
 */
export interface MockQueryConfig {
  /** Tool calls to simulate in assistant response */
  triggeredTools?: MockToolCall[];

  /** Subagent spawns to simulate (triggers SubagentStart/SubagentStop hooks) */
  subagentSpawns?: MockSubagentSpawn[];

  /** Error message to simulate (makes execution fail) */
  errorMessage?: string;

  /** Whether to simulate a timeout via AbortSignal */
  shouldTimeout?: boolean;

  /** Whether to simulate an interrupt (yields result message and stops early) */
  shouldInterrupt?: boolean;

  /** Cost in USD to report */
  costUsd?: number;

  /** Duration in ms to report */
  durationMs?: number;

  /** Number of turns to report */
  numTurns?: number;

  /** Permission denials to report */
  permissionDenials?: SDKPermissionDenial[];

  /** Custom messages to inject */
  customMessages?: SDKMessage[];

  /** Plugins to report as loaded */
  loadedPlugins?: { name: string; path: string }[];

  /** MCP servers to report */
  mcpServers?: { name: string; status: string; error?: string }[];

  /** Available tools to report */
  availableTools?: string[];

  /** Available slash commands to report */
  slashCommands?: string[];

  /** Session ID to use */
  sessionId?: string;

  /** User message ID for rewind testing */
  userMessageId?: string;

  /** Tool results to inject after tool calls */
  toolResults?: {
    toolUseId: string;
    content: string;
    isError?: boolean;
  }[];

  /** Whether rewindFiles should throw */
  rewindFilesError?: string;
}

/**
 * Default mock configuration values.
 */
const MOCK_DEFAULTS: Required<
  Pick<
    MockQueryConfig,
    | "costUsd"
    | "durationMs"
    | "numTurns"
    | "sessionId"
    | "availableTools"
    | "slashCommands"
  >
> = {
  costUsd: 0.01,
  durationMs: 1000,
  numTurns: 2,
  sessionId: "mock-session-123",
  availableTools: ["Skill", "Task", "SlashCommand", "Read", "Glob", "Grep"],
  slashCommands: ["/commit", "/review-pr"],
};

/**
 * Create a mock query function for testing.
 *
 * Returns a QueryFunction that yields predetermined SDK messages
 * based on the configuration provided. This mock also calls
 * PreToolUse hooks to simulate tool capture.
 *
 * @param config - Mock configuration
 * @returns QueryFunction suitable for dependency injection
 *
 * @example
 * ```typescript
 * const mockQuery = createMockQueryFn({
 *   triggeredTools: [{ name: 'Skill', input: { skill: 'commit' } }],
 *   costUsd: 0.005,
 * });
 *
 * const result = await executeScenario({
 *   scenario,
 *   pluginPath,
 *   pluginName,
 *   config,
 *   queryFn: mockQuery,
 * });
 * ```
 */
/**
 * Build a minimal Query mock from an async generator function and optional method overrides.
 *
 * All 14 Query interface methods are stubbed with safe defaults.
 * Pass `overrides` to replace any method (e.g. `mcpServerStatus`, `supportedCommands`).
 *
 * @param genFn - Factory that creates the async generator yielding SDK messages.
 * @param overrides - Partial map of Query methods to override defaults.
 * @returns A Query-compatible mock object.
 */
export function buildMockQuery(
  genFn: () => AsyncGenerator<SDKMessage, void>,
  overrides: Partial<{
    rewindFiles: Query["rewindFiles"];
    supportedCommands: Query["supportedCommands"];
    mcpServerStatus: Query["mcpServerStatus"];
    accountInfo: Query["accountInfo"];
    interrupt: Query["interrupt"];
    setPermissionMode: Query["setPermissionMode"];
    setModel: Query["setModel"];
    setMaxThinkingTokens: Query["setMaxThinkingTokens"];
    supportedModels: Query["supportedModels"];
    reconnectMcpServer: Query["reconnectMcpServer"];
    toggleMcpServer: Query["toggleMcpServer"];
    setMcpServers: Query["setMcpServers"];
    streamInput: Query["streamInput"];
    close: Query["close"];
  }> = {},
): Query {
  const gen = genFn();

  return Object.assign(gen, {
    async rewindFiles(): Promise<RewindFilesResult> {
      return { canRewind: false };
    },
    async supportedCommands(): Promise<SlashCommand[]> {
      return [];
    },
    async mcpServerStatus(): Promise<SDKMcpServerStatus[]> {
      return [];
    },
    async accountInfo(): Promise<AccountInfo> {
      return { subscriptionType: "free" };
    },
    async interrupt(): Promise<void> {},
    async setPermissionMode(): Promise<void> {},
    async setModel(): Promise<void> {},
    async setMaxThinkingTokens(): Promise<void> {},
    async supportedModels(): Promise<
      { value: string; displayName: string; description: string }[]
    > {
      return [];
    },
    async reconnectMcpServer(): Promise<void> {},
    async toggleMcpServer(): Promise<void> {},
    async setMcpServers(): Promise<{
      added: string[];
      removed: string[];
      errors: Record<string, string>;
    }> {
      return { added: [], removed: [], errors: {} };
    },
    async streamInput(): Promise<void> {},
    close(): void {},
    ...overrides,
  }) as unknown as Query;
}

export function createMockQueryFn(config: MockQueryConfig = {}): QueryFunction {
  return (input: QueryInput): Query => {
    const messages: SDKMessage[] = [];
    let toolCallCounter = 0;

    // Track interrupt state — shared between interrupt() and the generator
    let interruptRequested = false;

    // Extract hooks for calling during tool use
    const preToolUseHooks: PreToolUseHookConfig[] =
      input.options?.hooks?.PreToolUse ?? [];
    const subagentStartHooks: SubagentStartHookConfig[] =
      input.options?.hooks?.SubagentStart ?? [];
    const subagentStopHooks: SubagentStopHookConfig[] =
      input.options?.hooks?.SubagentStop ?? [];

    // Build tool calls with IDs
    const toolCalls =
      config.triggeredTools?.map((t) => ({
        type: "tool_use" as const,
        id: t.id ?? `tool-use-${String(++toolCallCounter)}`,
        name: t.name,
        input: t.input,
      })) ?? [];

    // 1. System init message
    const systemMsg: SDKSystemMessage = {
      type: "system",
      subtype: "init",
      session_id: config.sessionId ?? MOCK_DEFAULTS.sessionId,
      tools: config.availableTools ?? MOCK_DEFAULTS.availableTools,
      slash_commands: config.slashCommands ?? MOCK_DEFAULTS.slashCommands,
      plugins:
        config.loadedPlugins ??
        input.options?.plugins?.map((p) => ({
          name: "test-plugin",
          path: p.path,
        })) ??
        [],
      ...(config.mcpServers ? { mcp_servers: config.mcpServers } : {}),
    };
    messages.push(systemMsg);

    // 2. User message
    const userMsg: SDKUserMessage = {
      type: "user",
      uuid: (config.userMessageId ??
        `user-msg-${String(Date.now())}`) as `${string}-${string}-${string}-${string}-${string}`,
      message: {
        role: "user",
        content:
          typeof input.prompt === "string" ? input.prompt : "async input",
      },
      parent_tool_use_id: null,
      session_id: config.sessionId ?? MOCK_DEFAULTS.sessionId,
    };
    messages.push(userMsg);

    // 3. Handle error case
    if (config.errorMessage) {
      const errorMsg: SDKErrorMessage = {
        type: "error",
        error: config.errorMessage,
      };
      messages.push(errorMsg);
    } else {
      // 4. Assistant message with tool calls
      const assistantMsg: SDKAssistantMessage = {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "I'll help with that." },
            ...toolCalls,
          ],
        },
      };
      messages.push(assistantMsg);

      // 5. Tool results (if provided)
      if (config.toolResults) {
        for (const result of config.toolResults) {
          const toolResultMsg: SDKToolResultMessage = {
            type: "tool_result",
            tool_use_id: result.toolUseId,
            content: result.content,
            is_error: result.isError,
          };
          messages.push(toolResultMsg);
        }
      }
    }

    // Add custom messages
    if (config.customMessages) {
      messages.push(...config.customMessages);
    }

    // 6. Result message (matches SDKResultSuccess structure)
    const resultMsg = {
      type: "result" as const,
      subtype: "success" as const,
      total_cost_usd: config.costUsd ?? MOCK_DEFAULTS.costUsd,
      duration_ms: config.durationMs ?? MOCK_DEFAULTS.durationMs,
      duration_api_ms: config.durationMs ?? MOCK_DEFAULTS.durationMs,
      is_error: false,
      num_turns: config.numTurns ?? MOCK_DEFAULTS.numTurns,
      result: "Mock execution completed",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      modelUsage: {},
      permission_denials: config.permissionDenials ?? [],
      uuid: `mock-uuid-${String(Date.now())}` as `${string}-${string}-${string}-${string}-${string}`,
      session_id: config.sessionId ?? MOCK_DEFAULTS.sessionId,
    } satisfies SDKResultMessage;
    messages.push(resultMsg);

    // Helper to call PreToolUse hooks for a tool
    const callHooksForTool = async (
      toolName: string,
      toolInput: unknown,
      toolUseId: string,
    ) => {
      for (const hookConfig of preToolUseHooks) {
        // Check if matcher matches the tool name
        const matcher = new RegExp(hookConfig.matcher);
        if (matcher.test(toolName)) {
          // Call each hook in the config
          for (const hook of hookConfig.hooks) {
            await hook(
              { tool_name: toolName, tool_input: toolInput },
              toolUseId,
              {
                signal:
                  input.options?.abortController?.signal ??
                  new AbortController().signal,
              },
            );
          }
        }
      }
    };

    // Helper to call SubagentStart hooks for an agent
    const callSubagentStartHooks = async (
      agentId: string,
      agentType: string,
    ) => {
      for (const hookConfig of subagentStartHooks) {
        const matcher = new RegExp(hookConfig.matcher);
        if (matcher.test(agentType)) {
          for (const hook of hookConfig.hooks) {
            await hook(
              { agent_id: agentId, agent_type: agentType },
              `subagent-start-${agentId}`,
              {
                signal:
                  input.options?.abortController?.signal ??
                  new AbortController().signal,
              },
            );
          }
        }
      }
    };

    // Helper to call SubagentStop hooks for an agent
    const callSubagentStopHooks = async (agentId: string) => {
      for (const hookConfig of subagentStopHooks) {
        const matcher = new RegExp(hookConfig.matcher);
        // SubagentStop matcher typically matches on agent_id
        if (matcher.test(agentId) || hookConfig.matcher === ".*") {
          for (const hook of hookConfig.hooks) {
            await hook({ agent_id: agentId }, `subagent-stop-${agentId}`, {
              signal:
                input.options?.abortController?.signal ??
                new AbortController().signal,
            });
          }
        }
      }
    };

    // Create Query-like mock with async generator protocol
    const iterator = async function* () {
      for (const msg of messages) {
        // Simulate timeout if requested
        if (config.shouldTimeout) {
          if (input.options?.abortController?.signal.aborted) {
            const error = new Error("Operation aborted");
            error.name = "AbortError";
            throw error;
          }
        }

        // Simulate interrupt: when interrupt is requested (or pre-configured),
        // yield the result message and return early
        if (interruptRequested || config.shouldInterrupt) {
          if (msg.type === "result" || msg === messages[messages.length - 1]) {
            // Yield the result message so the consumer gets partial results
            yield resultMsg;
            return;
          }
        }

        // Call hooks before yielding assistant message with tool calls
        if (msg.type === "assistant" && !config.errorMessage) {
          for (const toolCall of toolCalls) {
            await callHooksForTool(toolCall.name, toolCall.input, toolCall.id);
          }

          // Simulate subagent spawns (both start and stop)
          if (config.subagentSpawns) {
            for (const spawn of config.subagentSpawns) {
              await callSubagentStartHooks(spawn.agentId, spawn.agentType);
              await callSubagentStopHooks(spawn.agentId);
            }
          }
        }

        yield msg;
      }
    };

    // Build a mock Query object implementing AsyncGenerator + methods
    const gen = iterator();
    const queryObject = Object.assign(gen, {
      async rewindFiles(
        _userMessageId: string,
        _options?: { dryRun?: boolean },
      ): Promise<RewindFilesResult> {
        if (config.rewindFilesError) {
          throw new Error(config.rewindFilesError);
        }
        return {
          canRewind: true,
          filesChanged: [],
          insertions: 0,
          deletions: 0,
        };
      },

      async supportedCommands(): Promise<SlashCommand[]> {
        return (config.slashCommands ?? MOCK_DEFAULTS.slashCommands).map(
          (name) => ({
            name,
            description: `Mock command: ${name}`,
            argumentHint: "",
          }),
        );
      },

      async mcpServerStatus(): Promise<SDKMcpServerStatus[]> {
        if (!config.mcpServers) {
          return [];
        }
        return config.mcpServers.map((server) => ({
          name: server.name,
          status: server.status as SDKMcpServerStatus["status"],
          ...(server.error !== undefined ? { error: server.error } : {}),
          tools: [],
        }));
      },

      async accountInfo(): Promise<AccountInfo> {
        return { subscriptionType: "free" };
      },

      async interrupt(): Promise<void> {
        interruptRequested = true;
      },

      async setPermissionMode(): Promise<void> {
        // No-op for mock
      },

      async setModel(): Promise<void> {
        // No-op for mock
      },

      async setMaxThinkingTokens(): Promise<void> {
        // No-op for mock
      },

      async supportedModels(): Promise<
        { value: string; displayName: string; description: string }[]
      > {
        return [];
      },

      async reconnectMcpServer(): Promise<void> {
        // No-op for mock
      },

      async toggleMcpServer(): Promise<void> {
        // No-op for mock
      },

      async setMcpServers(): Promise<{
        added: string[];
        removed: string[];
        errors: Record<string, string>;
      }> {
        return { added: [], removed: [], errors: {} };
      },

      async streamInput(): Promise<void> {
        // No-op for mock
      },

      close(): void {
        // No-op for mock
      },
    });

    return queryObject as unknown as Query;
  };
}

/**
 * Create a mock execution config for testing.
 *
 * @param overrides - Partial config to override defaults
 * @returns ExecutionConfig
 */
export function createMockExecutionConfig(
  overrides: Partial<ExecutionConfig> = {},
): ExecutionConfig {
  return {
    model: "claude-sonnet-4-20250514",
    max_turns: 3,
    timeout_ms: 30000,
    max_budget_usd: 1.0,
    session_isolation: true,
    permission_bypass: true,
    disallowed_tools: ["Write", "Edit", "Bash"],
    num_reps: 1,
    additional_plugins: [],
    ...overrides,
  };
}

/**
 * Create a mock query function that throws an error.
 *
 * @param errorMessage - Error message
 * @returns QueryFunction that throws
 */
export function createThrowingQueryFn(errorMessage: string): QueryFunction {
  return (_input: QueryInput): Query => {
    return buildMockQuery(async function* () {
      throw new Error(errorMessage);
    });
  };
}
