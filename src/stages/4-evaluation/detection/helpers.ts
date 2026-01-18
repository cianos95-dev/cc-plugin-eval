/**
 * Detection Helpers - Utility functions for detection operations.
 *
 * Provides helper functions for checking expected components,
 * deduplicating detections, and other common detection operations.
 */

import type {
  ComponentType,
  ProgrammaticDetection,
} from "../../../types/index.js";

/**
 * Check if expected component was triggered.
 *
 * @param detections - All detected components
 * @param expectedComponent - Expected component name
 * @param expectedType - Expected component type
 * @returns True if expected component was detected
 */
export function wasExpectedComponentTriggered(
  detections: ProgrammaticDetection[],
  expectedComponent: string,
  expectedType: ComponentType,
): boolean {
  return detections.some(
    (d) =>
      d.component_name === expectedComponent &&
      d.component_type === expectedType,
  );
}

/**
 * Get unique components from detections.
 *
 * @param detections - All detections (may contain duplicates)
 * @returns Unique detections by component name and type
 */
export function getUniqueDetections(
  detections: ProgrammaticDetection[],
): ProgrammaticDetection[] {
  const seen = new Set<string>();
  return detections.filter((d) => {
    const key = `${d.component_type}:${d.component_name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Check if expected MCP server was used.
 *
 * @public Intentionally exported for external consumers testing MCP server detection.
 * @param detections - Programmatic detections
 * @param expectedServerName - Expected MCP server name
 * @returns True if expected MCP server's tools were invoked
 *
 * @example
 * ```typescript
 * const used = wasExpectedMcpServerUsed(detections, "github");
 * ```
 */
export function wasExpectedMcpServerUsed(
  detections: ProgrammaticDetection[],
  expectedServerName: string,
): boolean {
  return detections.some(
    (d) =>
      d.component_type === "mcp_server" &&
      d.component_name === expectedServerName,
  );
}
