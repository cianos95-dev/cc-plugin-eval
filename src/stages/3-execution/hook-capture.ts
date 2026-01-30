/**
 * Hook capture utilities for Stage 3: Execution.
 *
 * Provides PreToolUse hooks to capture tool invocations during
 * scenario execution for programmatic detection in Stage 4.
 */

import type {
  HookJSONOutput,
  PreToolUseHookInput,
  SDKHookResponseMessage,
} from "./sdk-client.js";
import type { HookResponseCapture, ToolCapture } from "../../types/index.js";

/**
 * Callback specifically for PreToolUse hooks.
 *
 * This is a narrower type than the SDK's general HookCallback,
 * which handles multiple hook event types. This type is used
 * internally for tool capture collection where we only register
 * PreToolUse hooks.
 */
export type PreToolUseHookCallback = (
  input: PreToolUseHookInput,
  toolUseId: string | undefined,
  context: { signal: AbortSignal },
) => Promise<HookJSONOutput>;

/**
 * Tool capture collector.
 * Collects tool invocations during execution.
 */
export interface ToolCaptureCollector {
  /** Captured tools */
  captures: ToolCapture[];
  /** The hook callback to register with SDK */
  hook: PreToolUseHookCallback;
  /** Clear all captures */
  clear: () => void;
}

/**
 * Create a tool capture collector.
 *
 * Returns a collector with a PreToolUse hook that captures all tool
 * invocations. The captured data is used in Stage 4 for programmatic
 * detection of component triggering.
 *
 * @returns Tool capture collector
 *
 * @example
 * ```typescript
 * const collector = createToolCaptureCollector();
 *
 * // Register hook with Agent SDK
 * const result = await query({
 *   prompt: scenario.user_prompt,
 *   options: {
 *     hooks: {
 *       PreToolUse: [{
 *         matcher: '.*',
 *         hooks: [collector.hook]
 *       }]
 *     }
 *   }
 * });
 *
 * // Access captured tools
 * console.log(collector.captures);
 * ```
 */
export function createToolCaptureCollector(): ToolCaptureCollector {
  const captures: ToolCapture[] = [];

  const hook: PreToolUseHookCallback = async (
    input: PreToolUseHookInput,
    toolUseId: string | undefined,
    _context: { signal: AbortSignal },
  ): Promise<HookJSONOutput> => {
    captures.push({
      name: input.tool_name,
      input: input.tool_input,
      toolUseId,
      timestamp: Date.now(),
    });

    // Return empty object to allow operation to proceed
    return Promise.resolve({});
  };

  const clear = (): void => {
    captures.length = 0;
  };

  return {
    captures,
    hook,
    clear,
  };
}

/**
 * Tool names that indicate plugin component triggering.
 */
export const TRIGGER_TOOL_NAMES = [
  "Skill", // Skills are invoked via Skill tool
  "Task", // Agents are invoked via Task tool
  "SlashCommand", // Commands are invoked via SlashCommand tool
] as const;

/**
 * Check if a tool name indicates component triggering.
 *
 * @param toolName - Name of the tool
 * @returns True if tool indicates triggering
 */
export function isTriggerTool(toolName: string): boolean {
  return TRIGGER_TOOL_NAMES.some((name) => toolName === name);
}

/**
 * Check if a tool is an MCP tool.
 * MCP tools follow the pattern: mcp__<server>__<tool>
 *
 * @param toolName - Name of the tool
 * @returns True if tool is from MCP server
 */
export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith("mcp__");
}

/**
 * Parse MCP tool name to extract server and tool names.
 *
 * @param toolName - MCP tool name (e.g., "mcp__github__create_issue")
 * @returns Server and tool names, or null if not an MCP tool
 */
export function parseMcpToolName(toolName: string): {
  serverName: string;
  toolName: string;
} | null {
  if (!isMcpTool(toolName)) {
    return null;
  }

  // Pattern: mcp__<server>__<tool>
  const parts = toolName.split("__");
  if (parts.length < 3) {
    return null;
  }

  return {
    serverName: parts[1] ?? "",
    toolName: parts.slice(2).join("__"), // Handle tools with __ in name
  };
}

/**
 * Filter captures to only triggering tools.
 *
 * @param captures - All tool captures
 * @returns Only triggering tool captures
 */
export function filterTriggerCaptures(captures: ToolCapture[]): ToolCapture[] {
  return captures.filter((c) => isTriggerTool(c.name));
}

/**
 * Extract component name from Skill tool input.
 *
 * @param input - Skill tool input
 * @returns Component name or null
 */
export function extractSkillName(input: unknown): string | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const inputObj = input as Record<string, unknown>;

  // Skill tool uses "skill" parameter
  const skill = inputObj["skill"];
  if (typeof skill === "string") {
    return skill;
  }

  return null;
}

/**
 * Extract component name from Task tool input.
 *
 * @param input - Task tool input
 * @returns Component info or null
 */
export function extractTaskInfo(
  input: unknown,
): { subagentType: string; description?: string | undefined } | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const inputObj = input as Record<string, unknown>;

  // Task tool uses "subagent_type" parameter
  const subagentType = inputObj["subagent_type"];
  if (typeof subagentType === "string") {
    const description = inputObj["description"];
    return {
      subagentType,
      description: typeof description === "string" ? description : undefined,
    };
  }

  return null;
}

/**
 * Extract command name from SlashCommand tool input.
 *
 * @param input - SlashCommand tool input
 * @returns Command name or null
 */
export function extractCommandName(input: unknown): string | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const inputObj = input as Record<string, unknown>;

  // SlashCommand tool uses "command" parameter
  const command = inputObj["command"];
  if (typeof command === "string") {
    return command;
  }

  return null;
}

/** Result type for capture analysis */
interface CaptureAnalysisResult {
  skills: { name: string; capture: ToolCapture }[];
  agents: {
    subagentType: string;
    description?: string | undefined;
    capture: ToolCapture;
  }[];
  commands: { name: string; capture: ToolCapture }[];
  mcpTools: {
    serverName: string;
    toolName: string;
    capture: ToolCapture;
  }[];
}

/** Process a skill capture */
function processSkillCapture(
  capture: ToolCapture,
  result: CaptureAnalysisResult,
): void {
  const name = extractSkillName(capture.input);
  if (name) {
    result.skills.push({ name, capture });
  }
}

/** Process an agent/task capture */
function processAgentCapture(
  capture: ToolCapture,
  result: CaptureAnalysisResult,
): void {
  const info = extractTaskInfo(capture.input);
  if (info) {
    result.agents.push({ ...info, capture });
  }
}

/** Process a command capture */
function processCommandCapture(
  capture: ToolCapture,
  result: CaptureAnalysisResult,
): void {
  const name = extractCommandName(capture.input);
  if (name) {
    result.commands.push({ name, capture });
  }
}

/** Process an MCP tool capture */
function processMcpCapture(
  capture: ToolCapture,
  result: CaptureAnalysisResult,
): void {
  const parsed = parseMcpToolName(capture.name);
  if (parsed) {
    result.mcpTools.push({ ...parsed, capture });
  }
}

/**
 * Analyze tool captures to identify triggered components.
 *
 * @param captures - Tool captures from execution
 * @returns Analysis of triggered components
 */
export function analyzeCaptures(
  captures: ToolCapture[],
): CaptureAnalysisResult {
  const result: CaptureAnalysisResult = {
    skills: [],
    agents: [],
    commands: [],
    mcpTools: [],
  };

  for (const capture of captures) {
    switch (capture.name) {
      case "Skill":
        processSkillCapture(capture, result);
        break;
      case "Task":
        processAgentCapture(capture, result);
        break;
      case "SlashCommand":
        processCommandCapture(capture, result);
        break;
      default:
        if (isMcpTool(capture.name)) {
          processMcpCapture(capture, result);
        }
    }
  }

  return result;
}

/**
 * Hook response collector.
 * Collects hook responses from SDK messages during execution.
 */
export interface HookResponseCollector {
  /** Captured hook responses */
  responses: HookResponseCapture[];
  /** Process an SDK message to extract hook responses */
  processMessage: (message: unknown) => void;
  /** Clear all captured responses */
  clear: () => void;
}

/**
 * Type guard for SDKHookResponseMessage.
 * Uses the SDK's exported type for accurate field checking.
 *
 * @param message - SDK message to check
 * @returns True if message is a hook response
 */
function isHookResponseMessage(
  message: unknown,
): message is SDKHookResponseMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const msg = message as Record<string, unknown>;

  return (
    msg["type"] === "system" &&
    msg["subtype"] === "hook_response" &&
    typeof msg["hook_name"] === "string" &&
    typeof msg["hook_event"] === "string" &&
    typeof msg["stdout"] === "string" &&
    typeof msg["stderr"] === "string"
  );
}

/**
 * Create a hook response collector.
 *
 * This collector processes SDK messages and extracts hook response messages
 * (SDKHookResponseMessage) for programmatic detection of hook activation.
 *
 * @returns Hook response collector
 *
 * @example
 * ```typescript
 * const collector = createHookResponseCollector();
 *
 * // Process each SDK message during execution
 * for await (const message of query) {
 *   collector.processMessage(message);
 *   // ... handle other message types
 * }
 *
 * // Access captured hook responses
 * console.log(collector.responses);
 * ```
 */
export function createHookResponseCollector(): HookResponseCollector {
  const responses: HookResponseCapture[] = [];

  const processMessage = (message: unknown): void => {
    // Check if message is an SDKHookResponseMessage
    if (!isHookResponseMessage(message)) {
      return;
    }

    // After type guard, message is narrowed to SDKHookResponseMessage
    responses.push({
      hookName: message.hook_name,
      hookEvent: message.hook_event,
      hookId: message.hook_id,
      stdout: message.stdout,
      stderr: message.stderr,
      exitCode: message.exit_code,
      outcome: message.outcome,
      timestamp: Date.now(),
    });
  };

  const clear = (): void => {
    responses.length = 0;
  };

  return {
    responses,
    processMessage,
    clear,
  };
}

/**
 * Analyze hook responses to identify triggered hooks.
 *
 * @param responses - Hook response captures from execution
 * @param expectedHookName - Optional hook name to filter by
 * @returns Matching hook responses
 */
export function analyzeHookResponses(
  responses: HookResponseCapture[],
  expectedHookName?: string,
): HookResponseCapture[] {
  if (!expectedHookName) {
    return responses;
  }

  // Match by exact name or pattern
  return responses.filter((r) => {
    // Exact match
    if (r.hookName === expectedHookName) {
      return true;
    }

    // Pattern match (hook name may include event type)
    if (expectedHookName.includes("::")) {
      const [eventType, matcher] = expectedHookName.split("::");
      return r.hookEvent === eventType && r.hookName.includes(matcher ?? "");
    }

    return false;
  });
}
