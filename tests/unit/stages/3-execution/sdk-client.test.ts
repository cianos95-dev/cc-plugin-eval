/**
 * Unit tests for sdk-client.ts
 *
 * Tests type guards and helper functions for SDK message handling.
 */

import { describe, expect, it, vi } from "vitest";

import {
  isUserMessage,
  isAssistantMessage,
  isToolResultMessage,
  isResultMessage,
  isSystemMessage,
  isErrorMessage,
  isToolProgressMessage,
  isToolUseSummaryMessage,
  isFilesPersistedEvent,
  isTaskNotificationMessage,
  isAuthStatusMessage,
  getErrorFromMessage,
  getMessageId,
  type SDKMessage,
  type SDKUserMessage,
  type SDKAssistantMessage,
  type SDKToolResultMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
  type SDKErrorMessage,
} from "../../../../src/stages/3-execution/sdk-client.js";

describe("SDK Message Type Guards", () => {
  describe("isUserMessage", () => {
    it("returns true for valid user message", () => {
      const msg: SDKUserMessage = {
        type: "user",
        id: "user-123",
        message: {
          role: "user",
          content: "Hello, world!",
        },
      };

      expect(isUserMessage(msg)).toBe(true);
    });

    it("returns true for user message without id", () => {
      const msg: SDKMessage = {
        type: "user",
        message: {
          role: "user",
          content: "Hello",
        },
      };

      expect(isUserMessage(msg)).toBe(true);
    });

    it("returns false for non-user message", () => {
      const msg: SDKMessage = {
        type: "assistant",
        message: {
          role: "assistant",
          content: [],
        },
      };

      expect(isUserMessage(msg)).toBe(false);
    });

    it("returns false for user type without message object", () => {
      const msg: SDKMessage = {
        type: "user",
      };

      expect(isUserMessage(msg)).toBe(false);
    });

    it("returns false for message with wrong message type", () => {
      const msg: SDKMessage = {
        type: "user",
        message: "string instead of object",
      };

      expect(isUserMessage(msg)).toBe(false);
    });
  });

  describe("isAssistantMessage", () => {
    it("returns true for valid assistant message", () => {
      const msg: SDKAssistantMessage = {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello!" }],
        },
      };

      expect(isAssistantMessage(msg)).toBe(true);
    });

    it("returns true for assistant message with tool use", () => {
      const msg: SDKAssistantMessage = {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Let me check that." },
            { type: "tool_use", id: "tool-1", name: "Read", input: {} },
          ],
        },
      };

      expect(isAssistantMessage(msg)).toBe(true);
    });

    it("returns false for non-assistant message", () => {
      const msg: SDKMessage = {
        type: "user",
        message: {
          role: "user",
          content: "Hello",
        },
      };

      expect(isAssistantMessage(msg)).toBe(false);
    });

    it("returns false for assistant type without message object", () => {
      const msg: SDKMessage = {
        type: "assistant",
      };

      expect(isAssistantMessage(msg)).toBe(false);
    });
  });

  describe("isToolResultMessage", () => {
    it("returns true for valid tool result message", () => {
      const msg: SDKToolResultMessage = {
        type: "tool_result",
        tool_use_id: "tool-123",
        content: "File contents here",
      };

      expect(isToolResultMessage(msg)).toBe(true);
    });

    it("returns true for error tool result", () => {
      const msg: SDKToolResultMessage = {
        type: "tool_result",
        tool_use_id: "tool-456",
        content: "Error: file not found",
        is_error: true,
      };

      expect(isToolResultMessage(msg)).toBe(true);
    });

    it("returns false for non-tool-result message", () => {
      const msg: SDKMessage = {
        type: "user",
        message: {
          role: "user",
          content: "Hello",
        },
      };

      expect(isToolResultMessage(msg)).toBe(false);
    });

    it("returns false for tool_result type without tool_use_id", () => {
      const msg: SDKMessage = {
        type: "tool_result",
        content: "Result",
      };

      expect(isToolResultMessage(msg)).toBe(false);
    });

    it("returns false when tool_use_id is not a string", () => {
      const msg: SDKMessage = {
        type: "tool_result",
        tool_use_id: 123,
      };

      expect(isToolResultMessage(msg)).toBe(false);
    });
  });

  describe("isResultMessage", () => {
    it("returns true for valid result message", () => {
      const msg: SDKResultMessage = {
        type: "result",
        total_cost_usd: 0.01,
        duration_ms: 1500,
        num_turns: 3,
      };

      expect(isResultMessage(msg)).toBe(true);
    });

    it("returns true for minimal result message", () => {
      const msg: SDKMessage = {
        type: "result",
      };

      expect(isResultMessage(msg)).toBe(true);
    });

    it("returns true for result with permission denials", () => {
      const msg: SDKResultMessage = {
        type: "result",
        total_cost_usd: 0.02,
        duration_ms: 2000,
        num_turns: 4,
        permission_denials: ["Write blocked", "Edit blocked"],
      };

      expect(isResultMessage(msg)).toBe(true);
    });

    it("returns false for non-result message", () => {
      const msg: SDKMessage = {
        type: "error",
        error: "Something went wrong",
      };

      expect(isResultMessage(msg)).toBe(false);
    });
  });

  describe("isSystemMessage", () => {
    it("returns true for system init message", () => {
      const msg: SDKSystemMessage = {
        type: "system",
        subtype: "init",
        session_id: "session-abc",
        tools: ["Read", "Write", "Skill"],
        slash_commands: ["/commit"],
        plugins: [{ name: "test-plugin", path: "/path/to/plugin" }],
      };

      expect(isSystemMessage(msg)).toBe(true);
    });

    it("returns true for minimal system init message", () => {
      const msg: SDKMessage = {
        type: "system",
        subtype: "init",
      };

      expect(isSystemMessage(msg)).toBe(true);
    });

    it("returns false for non-init system messages", () => {
      // System status messages don't have the plugins array
      const statusMsg: SDKMessage = {
        type: "system",
        subtype: "status",
      };
      expect(isSystemMessage(statusMsg)).toBe(false);

      // System messages without subtype are also not init messages
      const minimalMsg: SDKMessage = {
        type: "system",
      };
      expect(isSystemMessage(minimalMsg)).toBe(false);
    });

    it("returns true for system message with MCP servers", () => {
      const msg: SDKSystemMessage = {
        type: "system",
        subtype: "init",
        mcp_servers: [
          { name: "github", status: "connected" },
          { name: "postgres", status: "failed", error: "Connection refused" },
        ],
      };

      expect(isSystemMessage(msg)).toBe(true);
    });

    it("returns false for non-system message", () => {
      const msg: SDKMessage = {
        type: "user",
        message: {
          role: "user",
          content: "Hello",
        },
      };

      expect(isSystemMessage(msg)).toBe(false);
    });
  });

  describe("isErrorMessage", () => {
    it("returns true for error message", () => {
      const msg: SDKErrorMessage = {
        type: "error",
        error: "Rate limit exceeded",
      };

      expect(isErrorMessage(msg)).toBe(true);
    });

    it("returns true for error message without error text", () => {
      const msg: SDKMessage = {
        type: "error",
      };

      expect(isErrorMessage(msg)).toBe(true);
    });

    it("returns false for non-error message", () => {
      const msg: SDKMessage = {
        type: "result",
        total_cost_usd: 0.01,
      };

      expect(isErrorMessage(msg)).toBe(false);
    });
  });

  describe("isToolProgressMessage", () => {
    it("returns true for tool progress message", () => {
      const msg = {
        type: "tool_progress",
        tool_use_id: "tool-123",
        tool_name: "Bash",
        parent_tool_use_id: null,
        elapsed_time_seconds: 5.0,
        uuid: "uuid-1",
        session_id: "sess-1",
      } as SDKMessage;

      expect(isToolProgressMessage(msg)).toBe(true);
    });

    it("returns false for non-tool-progress message", () => {
      const msg = {
        type: "user",
        message: { role: "user", content: "Hi" },
      } as SDKMessage;
      expect(isToolProgressMessage(msg)).toBe(false);
    });
  });

  describe("isToolUseSummaryMessage", () => {
    it("returns true for tool use summary message", () => {
      const msg = {
        type: "tool_use_summary",
        summary: "Read a file",
        preceding_tool_use_ids: ["tool-1"],
        uuid: "uuid-1",
        session_id: "sess-1",
      } as SDKMessage;

      expect(isToolUseSummaryMessage(msg)).toBe(true);
    });

    it("returns false for non-summary message", () => {
      const msg = { type: "result" } as SDKMessage;
      expect(isToolUseSummaryMessage(msg)).toBe(false);
    });
  });

  describe("isFilesPersistedEvent", () => {
    it("returns true for files_persisted system message", () => {
      const msg = {
        type: "system",
        subtype: "files_persisted",
        files: [],
        failed: [],
        processed_at: "2026-01-30T00:00:00Z",
        uuid: "uuid-1",
        session_id: "sess-1",
      } as SDKMessage;

      expect(isFilesPersistedEvent(msg)).toBe(true);
    });

    it("returns false for system init message", () => {
      const msg = { type: "system", subtype: "init" } as SDKMessage;
      expect(isFilesPersistedEvent(msg)).toBe(false);
    });

    it("returns false for non-system message", () => {
      const msg = {
        type: "user",
        message: { role: "user", content: "Hi" },
      } as SDKMessage;
      expect(isFilesPersistedEvent(msg)).toBe(false);
    });
  });

  describe("isTaskNotificationMessage", () => {
    it("returns true for task_notification system message", () => {
      const msg = {
        type: "system",
        subtype: "task_notification",
        task_id: "task-1",
        status: "completed",
        output_file: "/tmp/out.txt",
        summary: "Done",
        uuid: "uuid-1",
        session_id: "sess-1",
      } as SDKMessage;

      expect(isTaskNotificationMessage(msg)).toBe(true);
    });

    it("returns false for files_persisted system message", () => {
      const msg = { type: "system", subtype: "files_persisted" } as SDKMessage;
      expect(isTaskNotificationMessage(msg)).toBe(false);
    });

    it("returns false for system init message", () => {
      const msg = { type: "system", subtype: "init" } as SDKMessage;
      expect(isTaskNotificationMessage(msg)).toBe(false);
    });
  });

  describe("isAuthStatusMessage", () => {
    it("returns true for auth_status message", () => {
      const msg = {
        type: "auth_status",
        isAuthenticating: true,
        output: ["Authenticating..."],
        uuid: "uuid-1",
        session_id: "sess-1",
      } as SDKMessage;

      expect(isAuthStatusMessage(msg)).toBe(true);
    });

    it("returns false for non-auth-status message", () => {
      const msg = { type: "system", subtype: "status" } as SDKMessage;
      expect(isAuthStatusMessage(msg)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("handles messages with extra properties", () => {
      const msg: SDKMessage = {
        type: "result",
        total_cost_usd: 0.01,
        extra_field: "ignored",
        another_field: 42,
      };

      expect(isResultMessage(msg)).toBe(true);
    });

    it("handles empty object", () => {
      const msg = {} as SDKMessage;

      expect(isUserMessage(msg)).toBe(false);
      expect(isAssistantMessage(msg)).toBe(false);
      expect(isToolResultMessage(msg)).toBe(false);
      expect(isResultMessage(msg)).toBe(false);
      expect(isSystemMessage(msg)).toBe(false);
      expect(isErrorMessage(msg)).toBe(false);
    });

    it("handles null message field", () => {
      // Note: typeof null === "object" in JavaScript, so this is truthy
      // The implementation accepts this edge case since null message fields
      // don't occur in practice from the SDK
      const msg: SDKMessage = {
        type: "user",
        message: null,
      };

      // typeof null === "object", so this returns true per JS semantics
      expect(isUserMessage(msg)).toBe(true);
    });

    it("handles array message field", () => {
      const msg: SDKMessage = {
        type: "user",
        message: [],
      };

      expect(isUserMessage(msg)).toBe(true); // arrays are objects in JS
    });
  });

  describe("getErrorFromMessage", () => {
    it("returns error text for error message", () => {
      const msg = {
        type: "error",
        error: "Rate limit exceeded",
      } as SDKMessage;

      expect(getErrorFromMessage(msg)).toBe("Rate limit exceeded");
    });

    it("returns 'Unknown error' when error property is undefined", () => {
      const msg = {
        type: "error",
      } as SDKMessage;

      expect(getErrorFromMessage(msg)).toBe("Unknown error");
    });

    it("returns undefined for non-error message", () => {
      const msg: SDKMessage = {
        type: "user",
        message: { role: "user", content: "Hello" },
      };

      expect(getErrorFromMessage(msg)).toBeUndefined();
    });

    it("returns undefined for result message", () => {
      const msg: SDKMessage = {
        type: "result",
        total_cost_usd: 0.01,
      };

      expect(getErrorFromMessage(msg)).toBeUndefined();
    });
  });

  describe("getMessageId", () => {
    it("returns uuid when present", () => {
      const msg = {
        type: "user",
        uuid: "uuid-456",
        message: { role: "user", content: "Hello" },
      } as SDKMessage;

      expect(getMessageId(msg)).toBe("uuid-456");
    });

    it("returns undefined when uuid not present", () => {
      const msg: SDKMessage = {
        type: "user",
        message: { role: "user", content: "Hello" },
      };

      expect(getMessageId(msg)).toBeUndefined();
    });

    it("returns undefined when uuid is not a string", () => {
      const msg = {
        type: "user",
        uuid: { nested: "object" },
        message: { role: "user", content: "Hello" },
      } as SDKMessage;

      expect(getMessageId(msg)).toBeUndefined();
    });
  });
});

describe("SDK Query Functions", () => {
  // Mock the SDK query function
  vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
    query: vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield { type: "system", subtype: "init" };
        yield { type: "user", message: { role: "user", content: "test" } };
        yield { type: "result", total_cost_usd: 0.01 };
      },
    })),
  }));

  describe("executeQuery", () => {
    it("returns a QueryObject from the SDK", async () => {
      // Dynamic import to get the mocked version
      const { executeQuery } =
        await import("../../../../src/stages/3-execution/sdk-client.js");

      const result = executeQuery({ prompt: "test" });

      // Should return an async iterable
      expect(result[Symbol.asyncIterator]).toBeDefined();
    });
  });

  describe("collectQueryMessages", () => {
    it("collects all messages from query execution", async () => {
      const { collectQueryMessages } =
        await import("../../../../src/stages/3-execution/sdk-client.js");

      const messages = await collectQueryMessages({ prompt: "test prompt" });

      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0]?.type).toBe("system");
    });
  });
});
