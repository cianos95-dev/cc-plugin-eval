/**
 * Two-tier timeout strategy for graceful query interruption.
 *
 * Supports two strategies:
 * - "abort_only": Single hard abort after timeout_ms (legacy behavior)
 * - "interrupt_first": Soft interrupt at timeout_ms, hard abort after grace period
 */

import { createInterruptedError } from "./transcript-builder.js";

import type { Query } from "./sdk-client.js";
import type {
  TimeoutStrategy,
  TranscriptErrorEvent,
} from "../../types/index.js";

/** Mutable holder for a Query reference, allowing timeout callbacks to access the query lazily. */
export interface QueryHolder {
  query: Query | undefined;
}

/** Result of createTimeout with cleanup and state tracking. */
export interface TwoTierTimeout {
  /** Call to clear all pending timers */
  cleanup: () => void;
  /** Whether an interrupt was fired (for error classification) */
  interrupted: { value: boolean };
}

export interface TimeoutConfig {
  timeout_ms: number;
  timeout_strategy: TimeoutStrategy;
  interrupt_grace_ms: number;
}

/**
 * Create a timeout mechanism for scenario execution.
 *
 * - `abort_only`: Single `setTimeout(() => abort(), timeout_ms)`
 * - `interrupt_first`: Soft timeout calls `query.interrupt()`, then schedules
 *   hard abort after `interrupt_grace_ms`. If query isn't created yet, falls
 *   through to hard abort immediately.
 */
export function createTimeout(
  controller: AbortController,
  queryHolder: QueryHolder,
  config: TimeoutConfig,
): TwoTierTimeout {
  const interrupted = { value: false };
  let softTimer: ReturnType<typeof setTimeout> | undefined;
  let hardTimer: ReturnType<typeof setTimeout> | undefined;

  const hardAbort = (): void => {
    controller.abort();
  };

  if (config.timeout_strategy === "abort_only") {
    softTimer = setTimeout(hardAbort, config.timeout_ms);
  } else {
    // interrupt_first strategy
    softTimer = setTimeout(() => {
      const query = queryHolder.query;
      if (query) {
        interrupted.value = true;
        query.interrupt().catch(() => {
          // Swallow errors — hard abort is the fallback
        });
        // Schedule hard abort after grace period
        hardTimer = setTimeout(hardAbort, config.interrupt_grace_ms);
      } else {
        // Query not yet created — fall through to hard abort
        hardAbort();
      }
    }, config.timeout_ms);
  }

  const cleanup = (): void => {
    if (softTimer !== undefined) {
      clearTimeout(softTimer);
      softTimer = undefined;
    }
    if (hardTimer !== undefined) {
      clearTimeout(hardTimer);
      hardTimer = undefined;
    }
  };

  return { cleanup, interrupted };
}

/**
 * If an interrupt was fired but no hard abort (timeout) error was recorded,
 * push an "interrupted" error event onto the errors array.
 */
export function addInterruptErrorIfNeeded(
  interrupted: { value: boolean },
  errors: TranscriptErrorEvent[],
): void {
  if (interrupted.value && !errors.some((e) => e.error_type === "timeout")) {
    errors.push(
      createInterruptedError("Execution interrupted by soft timeout"),
    );
  }
}
