/**
 * Type Guards - Type checking utilities for tool inputs.
 *
 * Provides interfaces and type guard functions for detecting
 * component types from tool input structures.
 */

/**
 * Skill tool input structure.
 */
export interface SkillToolInput {
  skill: string;
  args?: string;
}

/**
 * Task tool input structure.
 */
export interface TaskToolInput {
  subagent_type: string;
  prompt?: string;
  description?: string;
}

/**
 * Check if input is a Skill tool input.
 *
 * @param input - Tool input to check
 * @returns True if input matches Skill structure
 */
export function isSkillInput(input: unknown): input is SkillToolInput {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  // Use intermediate Record<string, unknown> for safer property access
  const record = input as Record<string, unknown>;
  return "skill" in record && typeof record["skill"] === "string";
}

/**
 * Check if input is a Task tool input.
 *
 * @param input - Tool input to check
 * @returns True if input matches Task structure
 */
export function isTaskInput(input: unknown): input is TaskToolInput {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  // Use intermediate Record<string, unknown> for safer property access
  const record = input as Record<string, unknown>;
  return (
    "subagent_type" in record && typeof record["subagent_type"] === "string"
  );
}
