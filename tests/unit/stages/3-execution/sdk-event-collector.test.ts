/**
 * Unit tests for sdk-event-collector.ts
 */

import { describe, expect, it } from "vitest";

import { createSDKEventCollector } from "../../../../src/stages/3-execution/sdk-event-collector.js";
import type { SDKMessage } from "../../../../src/stages/3-execution/sdk-client.js";
import type { ToolCapture } from "../../../../src/types/index.js";

/** Helper to create a ToolCapture with defaults */
function makeToolCapture(overrides: Partial<ToolCapture> = {}): ToolCapture {
  return {
    name: "Bash",
    input: {},
    toolUseId: "tool-123",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("createSDKEventCollector", () => {
  it("creates collector with empty initial state", () => {
    const collector = createSDKEventCollector();

    expect(collector.events).toEqual([]);
    expect(typeof collector.processMessage).toBe("function");
    expect(typeof collector.clear).toBe("function");
  });

  describe("tool progress enrichment", () => {
    it("enriches matching ToolCapture with progress data", () => {
      const collector = createSDKEventCollector();
      const tool = makeToolCapture({ toolUseId: "tool-abc" });

      collector.processMessage(
        {
          type: "tool_progress",
          tool_use_id: "tool-abc",
          tool_name: "Bash",
          parent_tool_use_id: null,
          elapsed_time_seconds: 5.2,
          uuid: "uuid-1",
          session_id: "sess-1",
        } as SDKMessage,
        [tool],
      );

      expect(tool.progress).toEqual({
        elapsed_time_seconds: 5.2,
        progress_count: 1,
      });
      // Should NOT appear in generic events
      expect(collector.events).toHaveLength(0);
    });

    it("increments progress_count on multiple messages", () => {
      const collector = createSDKEventCollector();
      const tool = makeToolCapture({ toolUseId: "tool-abc" });
      const progressMsg = {
        type: "tool_progress",
        tool_use_id: "tool-abc",
        tool_name: "Bash",
        parent_tool_use_id: null,
        elapsed_time_seconds: 1.0,
        uuid: "uuid-1",
        session_id: "sess-1",
      } as SDKMessage;

      collector.processMessage(progressMsg, [tool]);
      collector.processMessage(
        { ...progressMsg, elapsed_time_seconds: 3.5 } as SDKMessage,
        [tool],
      );

      expect(tool.progress).toEqual({
        elapsed_time_seconds: 3.5,
        progress_count: 2,
      });
    });

    it("includes parent_tool_use_id when present", () => {
      const collector = createSDKEventCollector();
      const tool = makeToolCapture({ toolUseId: "tool-child" });

      collector.processMessage(
        {
          type: "tool_progress",
          tool_use_id: "tool-child",
          tool_name: "Read",
          parent_tool_use_id: "tool-parent",
          elapsed_time_seconds: 2.0,
          uuid: "uuid-1",
          session_id: "sess-1",
        } as SDKMessage,
        [tool],
      );

      expect(tool.progress).toEqual({
        elapsed_time_seconds: 2.0,
        progress_count: 1,
        parent_tool_use_id: "tool-parent",
      });
    });

    it("silently drops progress for unknown tool", () => {
      const collector = createSDKEventCollector();
      const tool = makeToolCapture({ toolUseId: "tool-known" });

      collector.processMessage(
        {
          type: "tool_progress",
          tool_use_id: "tool-unknown",
          tool_name: "Bash",
          parent_tool_use_id: null,
          elapsed_time_seconds: 1.0,
          uuid: "uuid-1",
          session_id: "sess-1",
        } as SDKMessage,
        [tool],
      );

      expect(tool.progress).toBeUndefined();
      expect(collector.events).toHaveLength(0);
    });
  });

  describe("tool summary enrichment", () => {
    it("enriches matching ToolCaptures with summary", () => {
      const collector = createSDKEventCollector();
      const tool1 = makeToolCapture({ toolUseId: "tool-1" });
      const tool2 = makeToolCapture({ toolUseId: "tool-2" });
      const tool3 = makeToolCapture({ toolUseId: "tool-3" });

      collector.processMessage(
        {
          type: "tool_use_summary",
          summary: "Read two files and compared them",
          preceding_tool_use_ids: ["tool-1", "tool-2"],
          uuid: "uuid-1",
          session_id: "sess-1",
        } as SDKMessage,
        [tool1, tool2, tool3],
      );

      expect(tool1.summaryData).toEqual({
        summary: "Read two files and compared them",
      });
      expect(tool2.summaryData).toEqual({
        summary: "Read two files and compared them",
      });
      expect(tool3.summaryData).toBeUndefined();
      expect(collector.events).toHaveLength(0);
    });

    it("handles summary with no matching tools gracefully", () => {
      const collector = createSDKEventCollector();
      const tool = makeToolCapture({ toolUseId: "tool-known" });

      collector.processMessage(
        {
          type: "tool_use_summary",
          summary: "Did something",
          preceding_tool_use_ids: ["tool-unknown-1", "tool-unknown-2"],
          uuid: "uuid-1",
          session_id: "sess-1",
        } as SDKMessage,
        [tool],
      );

      expect(tool.summaryData).toBeUndefined();
      expect(collector.events).toHaveLength(0);
    });
  });

  describe("generic capture", () => {
    it("captures auth_status messages", () => {
      const collector = createSDKEventCollector();

      collector.processMessage(
        {
          type: "auth_status",
          isAuthenticating: true,
          output: ["Authenticating..."],
          uuid: "uuid-1",
          session_id: "sess-1",
        } as SDKMessage,
        [],
      );

      expect(collector.events).toHaveLength(1);
      expect(collector.events[0]?.type).toBe("auth_status");
      expect(collector.events[0]?.subtype).toBeUndefined();
      expect(collector.events[0]?.payload).toMatchObject({
        type: "auth_status",
        isAuthenticating: true,
      });
    });

    it("captures files_persisted events", () => {
      const collector = createSDKEventCollector();

      collector.processMessage(
        {
          type: "system",
          subtype: "files_persisted",
          files: [{ filename: "test.ts", file_id: "f-1" }],
          failed: [],
          processed_at: "2026-01-30T00:00:00Z",
          uuid: "uuid-1",
          session_id: "sess-1",
        } as SDKMessage,
        [],
      );

      expect(collector.events).toHaveLength(1);
      expect(collector.events[0]?.type).toBe("system");
      expect(collector.events[0]?.subtype).toBe("files_persisted");
    });

    it("captures task_notification events", () => {
      const collector = createSDKEventCollector();

      collector.processMessage(
        {
          type: "system",
          subtype: "task_notification",
          task_id: "task-123",
          status: "completed",
          output_file: "/tmp/output.txt",
          summary: "Task completed successfully",
          uuid: "uuid-1",
          session_id: "sess-1",
        } as SDKMessage,
        [],
      );

      expect(collector.events).toHaveLength(1);
      expect(collector.events[0]?.type).toBe("system");
      expect(collector.events[0]?.subtype).toBe("task_notification");
    });
  });

  describe("skip logic", () => {
    it("skips user messages", () => {
      const collector = createSDKEventCollector();

      collector.processMessage(
        {
          type: "user",
          message: { role: "user", content: "Hello" },
        } as SDKMessage,
        [],
      );

      expect(collector.events).toHaveLength(0);
    });

    it("skips assistant messages", () => {
      const collector = createSDKEventCollector();

      collector.processMessage(
        {
          type: "assistant",
          message: { role: "assistant", content: [] },
        } as SDKMessage,
        [],
      );

      expect(collector.events).toHaveLength(0);
    });

    it("skips result messages", () => {
      const collector = createSDKEventCollector();

      collector.processMessage(
        {
          type: "result",
          total_cost_usd: 0.01,
        } as SDKMessage,
        [],
      );

      expect(collector.events).toHaveLength(0);
    });

    it("skips system init messages", () => {
      const collector = createSDKEventCollector();

      collector.processMessage(
        {
          type: "system",
          subtype: "init",
          session_id: "sess-1",
        } as SDKMessage,
        [],
      );

      expect(collector.events).toHaveLength(0);
    });

    it("skips error messages", () => {
      const collector = createSDKEventCollector();

      collector.processMessage(
        {
          type: "error",
          error: "Something failed",
        } as SDKMessage,
        [],
      );

      expect(collector.events).toHaveLength(0);
    });

    it("skips tool_result messages", () => {
      const collector = createSDKEventCollector();

      collector.processMessage(
        {
          type: "tool_result",
          tool_use_id: "tool-123",
          content: "result text",
        } as SDKMessage,
        [],
      );

      expect(collector.events).toHaveLength(0);
    });

    it("skips hook_response system messages", () => {
      const collector = createSDKEventCollector();

      collector.processMessage(
        {
          type: "system",
          subtype: "hook_response",
          hook_name: "test-hook",
          hook_event: "PreToolUse",
          stdout: "",
          stderr: "",
        } as SDKMessage,
        [],
      );

      expect(collector.events).toHaveLength(0);
    });

    it("skips hook_started system messages", () => {
      const collector = createSDKEventCollector();

      collector.processMessage(
        {
          type: "system",
          subtype: "hook_started",
        } as SDKMessage,
        [],
      );

      expect(collector.events).toHaveLength(0);
    });

    it("skips stream_event messages", () => {
      const collector = createSDKEventCollector();

      collector.processMessage(
        {
          type: "stream_event",
          event: {},
        } as SDKMessage,
        [],
      );

      expect(collector.events).toHaveLength(0);
    });
  });

  describe("clear", () => {
    it("empties the events array", () => {
      const collector = createSDKEventCollector();

      collector.processMessage(
        {
          type: "auth_status",
          isAuthenticating: false,
          output: [],
          uuid: "uuid-1",
          session_id: "sess-1",
        } as SDKMessage,
        [],
      );

      expect(collector.events).toHaveLength(1);

      collector.clear();

      expect(collector.events).toHaveLength(0);
    });
  });
});
