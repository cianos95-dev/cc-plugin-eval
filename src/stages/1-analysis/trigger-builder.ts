/**
 * Trigger record builder utilities for Stage 1: Analysis.
 *
 * This module provides a generic helper for converting arrays of analyzed
 * components into Record objects indexed by component name, eliminating
 * repetitive loop patterns.
 *
 * @module trigger-builder
 */

/**
 * Builds a Record from an array of items using a mapper function.
 *
 * This generic helper eliminates the repetitive for-loop pattern used when
 * converting analyzed components (skills, agents, commands, hooks, MCP servers)
 * into Record objects indexed by their names.
 *
 * **Duplicate Key Behavior**: When the mapper produces duplicate keys, the last
 * value wins (standard `Object.fromEntries` behavior). In the analysis pipeline,
 * component names are expected to be unique within each type, so duplicates
 * indicate a plugin configuration issue rather than a normal case.
 *
 * @typeParam T - The type of items in the input array
 * @typeParam R - The type of values in the output Record
 * @param items - Array of items to convert
 * @param mapper - Function that extracts the key and value for each item
 * @returns Record mapping keys to values
 *
 * @example
 * ```typescript
 * // Before: 5 lines of repetitive loop code
 * const skillTriggers: Record<string, SkillTriggerInfo> = {};
 * for (const skill of skills) {
 *   skillTriggers[skill.name] = {
 *     triggers: skill.trigger_phrases,
 *     description: skill.description,
 *   };
 * }
 *
 * // After: 1 line using buildTriggerRecords
 * const skillTriggers = buildTriggerRecords(skills, (skill) => [
 *   skill.name,
 *   { triggers: skill.trigger_phrases, description: skill.description },
 * ]);
 * ```
 */
export function buildTriggerRecords<T, R>(
  items: T[],
  mapper: (item: T) => [string, R],
): Record<string, R> {
  return Object.fromEntries(items.map(mapper));
}
