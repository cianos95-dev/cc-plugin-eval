/**
 * Detection Module - Programmatic component detection.
 *
 * Provides 100% confidence detection from tool captures using real-time
 * PreToolUse hooks, transcript parsing, and hook response analysis.
 *
 * @module detection
 */

// Core detection functions
export { detectAllComponents, detectAllComponentsWithHooks } from "./core.js";

// Capture-based detection
export {
  detectFromCaptures,
  detectFromTranscript,
} from "./capture-detection.js";

// Command detection
export { detectDirectCommandInvocation } from "./commands.js";

// Correlation
export { correlateWithTranscript } from "./correlation.js";

// Hook detection
export { detectFromHookResponses, wasExpectedHookTriggered } from "./hooks.js";

// Agent detection
export { detectFromSubagentCaptures } from "./agents.js";

// Helper functions
export {
  getUniqueDetections,
  wasExpectedComponentTriggered,
  wasExpectedMcpServerUsed,
} from "./helpers.js";

// Type guards and interfaces
export {
  isSkillInput,
  isTaskInput,
  type SkillToolInput,
  type TaskToolInput,
} from "./types.js";
