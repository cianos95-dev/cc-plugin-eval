/**
 * Unit tests for tool-capture-hooks.ts
 *
 * Tests the shared hook creation functions for tool capture correlation.
 */

import { describe, expect, it, vi } from "vitest";

import {
  createPreToolUseHook,
  createPostToolUseHook,
  createPostToolUseFailureHook,
} from "../../../../src/stages/3-execution/tool-capture-hooks.js";
import type { ToolCapture } from "../../../../src/types/index.js";

describe("createPreToolUseHook", () => {
  it("should create ToolCapture and call onCapture callback", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const onCapture = vi.fn();

    const hook = createPreToolUseHook(captureMap, onCapture);

    await hook(
      { tool_name: "Skill", tool_input: { skill: "test-skill" } },
      "tool-use-123",
      { signal: new AbortController().signal },
    );

    expect(onCapture).toHaveBeenCalledTimes(1);
    const capture = onCapture.mock.calls[0]![0] as ToolCapture;
    expect(capture).toMatchObject({
      name: "Skill",
      input: { skill: "test-skill" },
      toolUseId: "tool-use-123",
    });
    expect(capture.timestamp).toBeTypeOf("number");
  });

  it("should store capture in map for Post hook correlation", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const onCapture = vi.fn();

    const hook = createPreToolUseHook(captureMap, onCapture);

    await hook(
      { tool_name: "Read", tool_input: { file: "test.ts" } },
      "tool-use-456",
      { signal: new AbortController().signal },
    );

    expect(captureMap.has("tool-use-456")).toBe(true);
    expect(captureMap.get("tool-use-456")).toMatchObject({
      name: "Read",
      input: { file: "test.ts" },
      toolUseId: "tool-use-456",
    });
  });

  it("should not store in map when toolUseId is undefined", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const onCapture = vi.fn();

    const hook = createPreToolUseHook(captureMap, onCapture);

    await hook({ tool_name: "Write", tool_input: {} }, undefined, {
      signal: new AbortController().signal,
    });

    expect(captureMap.size).toBe(0);
    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it("should skip capture for inputs without tool_name/tool_input", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const onCapture = vi.fn();

    const hook = createPreToolUseHook(captureMap, onCapture);

    // Input missing tool_name and tool_input
    await hook(
      { other_field: "value" } as unknown as {
        tool_name: string;
        tool_input: unknown;
      },
      "tool-use-789",
      { signal: new AbortController().signal },
    );

    expect(onCapture).not.toHaveBeenCalled();
    expect(captureMap.size).toBe(0);
  });

  it("should return empty object to allow operation to proceed", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const onCapture = vi.fn();

    const hook = createPreToolUseHook(captureMap, onCapture);

    const result = await hook(
      { tool_name: "Bash", tool_input: { command: "ls" } },
      "tool-use-abc",
      { signal: new AbortController().signal },
    );

    expect(result).toEqual({});
  });
});

describe("createPostToolUseHook", () => {
  it("should update capture with result and success=true", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const capture: ToolCapture = {
      name: "Read",
      input: { file: "test.ts" },
      toolUseId: "tool-use-123",
      timestamp: Date.now(),
    };
    captureMap.set("tool-use-123", capture);

    const hook = createPostToolUseHook(captureMap);

    await hook({ tool_response: "File contents here..." }, "tool-use-123", {
      signal: new AbortController().signal,
    });

    expect(capture.result).toBe("File contents here...");
    expect(capture.success).toBe(true);
  });

  it("should handle object responses", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const capture: ToolCapture = {
      name: "Bash",
      input: { command: "ls" },
      toolUseId: "tool-use-456",
      timestamp: Date.now(),
    };
    captureMap.set("tool-use-456", capture);

    const hook = createPostToolUseHook(captureMap);

    const response = { stdout: "file1.ts\nfile2.ts", exitCode: 0 };
    await hook({ tool_response: response }, "tool-use-456", {
      signal: new AbortController().signal,
    });

    expect(capture.result).toEqual(response);
    expect(capture.success).toBe(true);
  });

  it("should not modify capture if toolUseId not in map", async () => {
    const captureMap = new Map<string, ToolCapture>();

    const hook = createPostToolUseHook(captureMap);

    // Call with unknown toolUseId - should not throw
    await hook({ tool_response: "result" }, "unknown-tool-id", {
      signal: new AbortController().signal,
    });

    expect(captureMap.size).toBe(0);
  });

  it("should not modify capture if toolUseId is undefined", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const capture: ToolCapture = {
      name: "Read",
      input: {},
      toolUseId: "tool-use-123",
      timestamp: Date.now(),
    };
    captureMap.set("tool-use-123", capture);

    const hook = createPostToolUseHook(captureMap);

    await hook({ tool_response: "result" }, undefined, {
      signal: new AbortController().signal,
    });

    expect(capture.result).toBeUndefined();
    expect(capture.success).toBeUndefined();
  });

  it("should not modify capture if input lacks tool_response", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const capture: ToolCapture = {
      name: "Read",
      input: {},
      toolUseId: "tool-use-123",
      timestamp: Date.now(),
    };
    captureMap.set("tool-use-123", capture);

    const hook = createPostToolUseHook(captureMap);

    await hook(
      { other_field: "value" } as unknown as { tool_response: unknown },
      "tool-use-123",
      { signal: new AbortController().signal },
    );

    expect(capture.result).toBeUndefined();
    expect(capture.success).toBeUndefined();
  });

  it("should return empty object to allow operation to proceed", async () => {
    const captureMap = new Map<string, ToolCapture>();

    const hook = createPostToolUseHook(captureMap);

    const result = await hook({ tool_response: "result" }, "tool-use-123", {
      signal: new AbortController().signal,
    });

    expect(result).toEqual({});
  });
});

describe("createPostToolUseFailureHook", () => {
  it("should update capture with error and success=false", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const capture: ToolCapture = {
      name: "Bash",
      input: { command: "invalid-command" },
      toolUseId: "tool-use-123",
      timestamp: Date.now(),
    };
    captureMap.set("tool-use-123", capture);

    const hook = createPostToolUseFailureHook(captureMap);

    await hook({ error: "Command not found" }, "tool-use-123", {
      signal: new AbortController().signal,
    });

    expect(capture.error).toBe("Command not found");
    expect(capture.success).toBe(false);
  });

  it("should set isInterrupt when is_interrupt is true", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const capture: ToolCapture = {
      name: "Bash",
      input: { command: "sleep 100" },
      toolUseId: "tool-use-456",
      timestamp: Date.now(),
    };
    captureMap.set("tool-use-456", capture);

    const hook = createPostToolUseFailureHook(captureMap);

    await hook(
      { error: "Operation cancelled", is_interrupt: true },
      "tool-use-456",
      { signal: new AbortController().signal },
    );

    expect(capture.error).toBe("Operation cancelled");
    expect(capture.success).toBe(false);
    expect(capture.isInterrupt).toBe(true);
  });

  it("should set isInterrupt to false when is_interrupt is false", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const capture: ToolCapture = {
      name: "Read",
      input: {},
      toolUseId: "tool-use-789",
      timestamp: Date.now(),
    };
    captureMap.set("tool-use-789", capture);

    const hook = createPostToolUseFailureHook(captureMap);

    await hook(
      { error: "File not found", is_interrupt: false },
      "tool-use-789",
      { signal: new AbortController().signal },
    );

    expect(capture.isInterrupt).toBe(false);
  });

  it("should not set isInterrupt when is_interrupt is undefined", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const capture: ToolCapture = {
      name: "Write",
      input: {},
      toolUseId: "tool-use-abc",
      timestamp: Date.now(),
    };
    captureMap.set("tool-use-abc", capture);

    const hook = createPostToolUseFailureHook(captureMap);

    await hook({ error: "Permission denied" }, "tool-use-abc", {
      signal: new AbortController().signal,
    });

    expect(capture.error).toBe("Permission denied");
    expect(capture.success).toBe(false);
    expect(capture.isInterrupt).toBeUndefined();
  });

  it("should not modify capture if toolUseId not in map", async () => {
    const captureMap = new Map<string, ToolCapture>();

    const hook = createPostToolUseFailureHook(captureMap);

    await hook({ error: "Some error" }, "unknown-tool-id", {
      signal: new AbortController().signal,
    });

    expect(captureMap.size).toBe(0);
  });

  it("should not modify capture if input lacks error", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const capture: ToolCapture = {
      name: "Read",
      input: {},
      toolUseId: "tool-use-123",
      timestamp: Date.now(),
    };
    captureMap.set("tool-use-123", capture);

    const hook = createPostToolUseFailureHook(captureMap);

    await hook(
      { other_field: "value" } as unknown as { error: string },
      "tool-use-123",
      { signal: new AbortController().signal },
    );

    expect(capture.error).toBeUndefined();
    expect(capture.success).toBeUndefined();
  });

  it("should return empty object to allow operation to proceed", async () => {
    const captureMap = new Map<string, ToolCapture>();

    const hook = createPostToolUseFailureHook(captureMap);

    const result = await hook({ error: "Test error" }, "tool-use-123", {
      signal: new AbortController().signal,
    });

    expect(result).toEqual({});
  });
});

describe("Pre/Post hook correlation", () => {
  it("should correlate Pre and Post hooks via captureMap", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const captures: ToolCapture[] = [];
    const onCapture = (capture: ToolCapture) => captures.push(capture);

    const preHook = createPreToolUseHook(captureMap, onCapture);
    const postHook = createPostToolUseHook(captureMap);

    // Simulate PreToolUse
    await preHook(
      { tool_name: "Read", tool_input: { file: "test.ts" } },
      "tool-use-corr-123",
      { signal: new AbortController().signal },
    );

    expect(captures).toHaveLength(1);
    expect(captures[0]!.result).toBeUndefined();
    expect(captures[0]!.success).toBeUndefined();

    // Simulate PostToolUse
    await postHook({ tool_response: "File content" }, "tool-use-corr-123", {
      signal: new AbortController().signal,
    });

    // The same capture object should be updated
    expect(captures[0]!.result).toBe("File content");
    expect(captures[0]!.success).toBe(true);
  });

  it("should correlate Pre and PostFailure hooks via captureMap", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const captures: ToolCapture[] = [];
    const onCapture = (capture: ToolCapture) => captures.push(capture);

    const preHook = createPreToolUseHook(captureMap, onCapture);
    const failureHook = createPostToolUseFailureHook(captureMap);

    // Simulate PreToolUse
    await preHook(
      { tool_name: "Bash", tool_input: { command: "rm -rf /" } },
      "tool-use-fail-456",
      { signal: new AbortController().signal },
    );

    expect(captures).toHaveLength(1);
    expect(captures[0]!.error).toBeUndefined();
    expect(captures[0]!.success).toBeUndefined();

    // Simulate PostToolUseFailure
    await failureHook(
      { error: "Operation denied", is_interrupt: true },
      "tool-use-fail-456",
      { signal: new AbortController().signal },
    );

    // The same capture object should be updated
    expect(captures[0]!.error).toBe("Operation denied");
    expect(captures[0]!.success).toBe(false);
    expect(captures[0]!.isInterrupt).toBe(true);
  });

  it("should handle multiple concurrent tool uses", async () => {
    const captureMap = new Map<string, ToolCapture>();
    const captures: ToolCapture[] = [];
    const onCapture = (capture: ToolCapture) => captures.push(capture);

    const preHook = createPreToolUseHook(captureMap, onCapture);
    const postHook = createPostToolUseHook(captureMap);

    // Start tool 1
    await preHook(
      { tool_name: "Read", tool_input: { file: "a.ts" } },
      "tool-1",
      { signal: new AbortController().signal },
    );

    // Start tool 2 before tool 1 finishes
    await preHook(
      { tool_name: "Read", tool_input: { file: "b.ts" } },
      "tool-2",
      { signal: new AbortController().signal },
    );

    expect(captures).toHaveLength(2);

    // Tool 2 finishes first
    await postHook({ tool_response: "Content B" }, "tool-2", {
      signal: new AbortController().signal,
    });

    // Tool 1 finishes second
    await postHook({ tool_response: "Content A" }, "tool-1", {
      signal: new AbortController().signal,
    });

    // Verify correct correlation
    expect(captures[0]!.input).toEqual({ file: "a.ts" });
    expect(captures[0]!.result).toBe("Content A");

    expect(captures[1]!.input).toEqual({ file: "b.ts" });
    expect(captures[1]!.result).toBe("Content B");
  });
});
