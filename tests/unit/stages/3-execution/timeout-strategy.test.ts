/**
 * Unit tests for timeout-strategy.ts
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTimeout,
  type QueryHolder,
} from "../../../../src/stages/3-execution/timeout-strategy.js";

describe("createTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("abort_only strategy", () => {
    it("aborts controller after timeout_ms", () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const queryHolder: QueryHolder = { query: undefined };

      const timeout = createTimeout(controller, queryHolder, {
        timeout_ms: 5000,
        timeout_strategy: "abort_only",
        interrupt_grace_ms: 10000,
      });

      expect(controller.signal.aborted).toBe(false);

      vi.advanceTimersByTime(5000);
      expect(controller.signal.aborted).toBe(true);
      expect(timeout.interrupted.value).toBe(false);

      timeout.cleanup();
    });

    it("does not abort if cleaned up before timeout", () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const queryHolder: QueryHolder = { query: undefined };

      const timeout = createTimeout(controller, queryHolder, {
        timeout_ms: 5000,
        timeout_strategy: "abort_only",
        interrupt_grace_ms: 10000,
      });

      timeout.cleanup();
      vi.advanceTimersByTime(10000);
      expect(controller.signal.aborted).toBe(false);
    });
  });

  describe("interrupt_first strategy", () => {
    it("calls interrupt on query at soft timeout", async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const mockQuery = {
        interrupt: vi.fn().mockResolvedValue(undefined),
      };
      const queryHolder: QueryHolder = {
        query: mockQuery as unknown as QueryHolder["query"],
      };

      const timeout = createTimeout(controller, queryHolder, {
        timeout_ms: 5000,
        timeout_strategy: "interrupt_first",
        interrupt_grace_ms: 3000,
      });

      vi.advanceTimersByTime(5000);
      // Let the microtask queue flush for the async interrupt call
      await vi.advanceTimersByTimeAsync(0);

      expect(mockQuery.interrupt).toHaveBeenCalledOnce();
      expect(timeout.interrupted.value).toBe(true);
      expect(controller.signal.aborted).toBe(false);

      timeout.cleanup();
    });

    it("hard aborts after grace period if query still running", async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const mockQuery = {
        interrupt: vi.fn().mockResolvedValue(undefined),
      };
      const queryHolder: QueryHolder = {
        query: mockQuery as unknown as QueryHolder["query"],
      };

      const timeout = createTimeout(controller, queryHolder, {
        timeout_ms: 5000,
        timeout_strategy: "interrupt_first",
        interrupt_grace_ms: 3000,
      });

      // Soft timeout fires
      await vi.advanceTimersByTimeAsync(5000);
      expect(controller.signal.aborted).toBe(false);

      // Grace period expires → hard abort
      vi.advanceTimersByTime(3000);
      expect(controller.signal.aborted).toBe(true);

      timeout.cleanup();
    });

    it("falls through to hard abort if query not yet created", () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const queryHolder: QueryHolder = { query: undefined };

      const timeout = createTimeout(controller, queryHolder, {
        timeout_ms: 5000,
        timeout_strategy: "interrupt_first",
        interrupt_grace_ms: 3000,
      });

      vi.advanceTimersByTime(5000);
      // No query → immediate hard abort
      expect(controller.signal.aborted).toBe(true);
      expect(timeout.interrupted.value).toBe(false);

      timeout.cleanup();
    });

    it("swallows interrupt() errors and still schedules hard abort", async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const mockQuery = {
        interrupt: vi.fn().mockRejectedValue(new Error("interrupt failed")),
      };
      const queryHolder: QueryHolder = {
        query: mockQuery as unknown as QueryHolder["query"],
      };

      const timeout = createTimeout(controller, queryHolder, {
        timeout_ms: 5000,
        timeout_strategy: "interrupt_first",
        interrupt_grace_ms: 3000,
      });

      // Soft timeout fires, interrupt rejects
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockQuery.interrupt).toHaveBeenCalledOnce();

      // Hard abort fires after grace period
      vi.advanceTimersByTime(3000);
      expect(controller.signal.aborted).toBe(true);

      timeout.cleanup();
    });

    it("cleanup cancels both soft and hard timers", async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const mockQuery = {
        interrupt: vi.fn().mockResolvedValue(undefined),
      };
      const queryHolder: QueryHolder = {
        query: mockQuery as unknown as QueryHolder["query"],
      };

      const timeout = createTimeout(controller, queryHolder, {
        timeout_ms: 5000,
        timeout_strategy: "interrupt_first",
        interrupt_grace_ms: 3000,
      });

      // Trigger soft timeout (schedules hard timer)
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockQuery.interrupt).toHaveBeenCalledOnce();

      // Cleanup before hard timer fires
      timeout.cleanup();
      vi.advanceTimersByTime(5000);
      expect(controller.signal.aborted).toBe(false);
    });
  });
});
