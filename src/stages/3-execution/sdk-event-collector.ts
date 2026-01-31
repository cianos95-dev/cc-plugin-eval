/**
 * SDK event collector for Stage 3: Execution.
 *
 * Captures new SDK v0.2.25+ message types via two strategies:
 * 1. Targeted enrichment — tool progress/summary data enriches existing ToolCapture entries
 * 2. Generic capture — all other unhandled message types stored as SDKEventCapture
 *
 * This provides forward-compatible capture: future SDK message types are automatically
 * stored without code changes.
 */

import {
  isToolProgressMessage,
  isToolUseSummaryMessage,
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
  isResultMessage,
  isSystemMessage,
  isErrorMessage,
  type SDKMessage,
  type SDKToolProgressMessage,
  type SDKToolUseSummaryMessage,
} from "./sdk-client.js";

import type { SDKEventCapture, ToolCapture } from "../../types/transcript.js";

/** System subtypes handled by other parts of the pipeline */
const HANDLED_SYSTEM_SUBTYPES = new Set([
  "init", // isSystemMessage
  "hook_response", // HookResponseCollector
  "hook_started", // SDK internal
  "hook_progress", // SDK internal
  "status", // SDK status messages
  "compact_boundary", // SDK compaction boundary
]);

/**
 * Collector for SDK events during scenario execution.
 */
export interface SDKEventCollector {
  /** Generic SDK events for unhandled message types */
  readonly events: SDKEventCapture[];
  /** Process an SDK message — enriches ToolCapture or stores as generic event */
  processMessage(message: SDKMessage, detectedTools: ToolCapture[]): void;
  /** Clear collected events (for session reuse) */
  clear(): void;
}

/**
 * Create a new SDK event collector.
 *
 * Follows the same factory pattern as createHookResponseCollector in hook-capture.ts.
 */
export function createSDKEventCollector(): SDKEventCollector {
  const events: SDKEventCapture[] = [];

  const processMessage = (
    message: SDKMessage,
    detectedTools: ToolCapture[],
  ): void => {
    // Phase 1: Targeted enrichment for tool progress
    if (isToolProgressMessage(message)) {
      enrichToolWithProgress(detectedTools, message);
      return;
    }

    // Phase 1: Targeted enrichment for tool summary
    if (isToolUseSummaryMessage(message)) {
      enrichToolsWithSummary(detectedTools, message);
      return;
    }

    // Skip messages already handled by the existing pipeline
    if (
      isUserMessage(message) ||
      isAssistantMessage(message) ||
      isResultMessage(message) ||
      isSystemMessage(message)
    ) {
      return;
    }

    // isToolResultMessage and isErrorMessage accept unknown
    const msgUnknown: unknown = message;
    if (isToolResultMessage(msgUnknown) || isErrorMessage(msgUnknown)) {
      return;
    }

    // Skip system subtypes handled elsewhere (hook_response, hook_started, etc.)
    if (message.type === "system") {
      const subtype = (message as { subtype?: string }).subtype;
      if (subtype && HANDLED_SYSTEM_SUBTYPES.has(subtype)) {
        return;
      }
    }

    // Skip streaming events (not useful for transcript capture)
    if (message.type === "stream_event") {
      return;
    }

    // Generic capture for everything else (auth_status, files_persisted,
    // task_notification, and any future SDK message types)
    const subtype = (message as { subtype?: string }).subtype;
    const event: SDKEventCapture = {
      type: message.type,
      timestamp: Date.now(),
      payload: { ...message } as Record<string, unknown>,
    };
    if (subtype !== undefined) {
      event.subtype = subtype;
    }
    events.push(event);
  };

  const clear = (): void => {
    events.length = 0;
  };

  return { events, processMessage, clear };
}

/**
 * Enrich a ToolCapture with progress data from SDKToolProgressMessage.
 *
 * Multiple progress messages may arrive for the same tool; we track
 * the latest elapsed time and increment the progress count.
 *
 * If no matching ToolCapture is found (e.g., PreToolUse hook didn't fire),
 * the progress message is silently dropped — it's high-volume and low-value
 * without a matching tool entry.
 */
function enrichToolWithProgress(
  detectedTools: ToolCapture[],
  message: SDKToolProgressMessage,
): void {
  const tool = detectedTools.find((t) => t.toolUseId === message.tool_use_id);
  if (!tool) {
    return;
  }

  const existing = tool.progress;
  tool.progress = {
    elapsed_time_seconds: message.elapsed_time_seconds,
    progress_count: (existing?.progress_count ?? 0) + 1,
    ...(message.parent_tool_use_id !== null
      ? { parent_tool_use_id: message.parent_tool_use_id }
      : {}),
  };
}

/**
 * Enrich ToolCapture entries with summary data from SDKToolUseSummaryMessage.
 *
 * A summary message references preceding tool use IDs; each matching
 * ToolCapture gets the same summary.
 */
function enrichToolsWithSummary(
  detectedTools: ToolCapture[],
  message: SDKToolUseSummaryMessage,
): void {
  for (const toolUseId of message.preceding_tool_use_ids) {
    const tool = detectedTools.find((t) => t.toolUseId === toolUseId);
    if (tool) {
      tool.summaryData = { summary: message.summary };
    }
  }
}
