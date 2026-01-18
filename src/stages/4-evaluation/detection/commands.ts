/**
 * Command Detection - Direct command invocation detection.
 *
 * Detects commands invoked with explicit /command syntax in user messages
 * that may not appear as SlashCommand tool calls.
 */

import type {
  ProgrammaticDetection,
  TestScenario,
  Transcript,
} from "../../../types/index.js";

/**
 * Detect direct command invocation from user message.
 *
 * Commands invoked with explicit `/command` syntax in user messages
 * may not appear as SlashCommand tool calls. This catches those cases.
 *
 * @param transcript - Execution transcript
 * @param _scenario - Test scenario (used for validation)
 * @returns Detection if command syntax found, null otherwise
 *
 * @example
 * ```typescript
 * // User message: "/plugin-dev:create-plugin"
 * const detection = detectDirectCommandInvocation(transcript, scenario);
 * // { component_type: 'command', component_name: 'create-plugin', ... }
 * ```
 */
export function detectDirectCommandInvocation(
  transcript: Transcript,
  _scenario: TestScenario,
): ProgrammaticDetection | null {
  // Find the first user message in the transcript
  const firstUserEvent = transcript.events.find((e) => e.type === "user");

  if (firstUserEvent?.type !== "user") {
    return null;
  }

  const content = firstUserEvent.edit.message.content;

  // Check if message starts with /command syntax
  if (!content.startsWith("/")) {
    return null;
  }

  // Match patterns like:
  // - /command
  // - /plugin:command
  // - /plugin:namespace/command
  // - /plugin:namespace:command
  const commandMatch = /^\/([a-z0-9-]+:)?([a-z0-9-/:]+)/i.exec(content);

  if (!commandMatch) {
    return null;
  }

  const commandName = commandMatch[2];

  // Handle namespace/command format - extract just the command part
  const normalizedName = commandName?.includes("/")
    ? (commandName.split("/").pop() ?? commandName)
    : commandName;

  const commandPrefix = content.split(" ")[0] ?? content;

  return {
    component_type: "command",
    component_name: normalizedName ?? "",
    confidence: 100,
    tool_name: "DirectInvocation",
    evidence: `Direct command invocation in user message: ${commandPrefix}`,
    timestamp: 0,
  };
}
