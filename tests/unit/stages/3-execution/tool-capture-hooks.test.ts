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
  createSubagentStartHook,
  createSubagentStopHook,
} from "../../../../src/stages/3-execution/tool-capture-hooks.js";
import type {
  ToolCapture,
  SubagentCapture,
} from "../../../../src/types/index.js";

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

describe("createSubagentStartHook", () => {
  it("should create SubagentCapture and call onCapture callback", async () => {
    const captureMap = new Map<string, SubagentCapture>();
    const onCapture = vi.fn();

    const hook = createSubagentStartHook(captureMap, onCapture);

    await hook({ agent_id: "agent-123", agent_type: "Explore" }, undefined, {
      signal: new AbortController().signal,
    });

    expect(onCapture).toHaveBeenCalledTimes(1);
    const capture = onCapture.mock.calls[0]![0] as SubagentCapture;
    expect(capture).toMatchObject({
      agentId: "agent-123",
      agentType: "Explore",
    });
    expect(capture.startTimestamp).toBeTypeOf("number");
  });

  it("should store capture in map for SubagentStop correlation", async () => {
    const captureMap = new Map<string, SubagentCapture>();
    const onCapture = vi.fn();

    const hook = createSubagentStartHook(captureMap, onCapture);

    await hook(
      { agent_id: "agent-456", agent_type: "general-purpose" },
      undefined,
      { signal: new AbortController().signal },
    );

    expect(captureMap.has("agent-456")).toBe(true);
    expect(captureMap.get("agent-456")).toMatchObject({
      agentId: "agent-456",
      agentType: "general-purpose",
    });
  });

  it("should skip capture for inputs without agent_id/agent_type", async () => {
    const captureMap = new Map<string, SubagentCapture>();
    const onCapture = vi.fn();

    const hook = createSubagentStartHook(captureMap, onCapture);

    await hook(
      { other_field: "value" } as unknown as {
        agent_id: string;
        agent_type: string;
      },
      undefined,
      { signal: new AbortController().signal },
    );

    expect(onCapture).not.toHaveBeenCalled();
    expect(captureMap.size).toBe(0);
  });

  it("should return empty object to allow operation to proceed", async () => {
    const captureMap = new Map<string, SubagentCapture>();
    const onCapture = vi.fn();

    const hook = createSubagentStartHook(captureMap, onCapture);

    const result = await hook(
      { agent_id: "agent-789", agent_type: "Bash" },
      undefined,
      { signal: new AbortController().signal },
    );

    expect(result).toEqual({});
  });
});

describe("createSubagentStopHook", () => {
  it("should update capture with stopTimestamp and transcript path", async () => {
    const captureMap = new Map<string, SubagentCapture>();
    const capture: SubagentCapture = {
      agentId: "agent-123",
      agentType: "Explore",
      startTimestamp: Date.now() - 1000,
    };
    captureMap.set("agent-123", capture);

    const hook = createSubagentStopHook(captureMap);

    await hook(
      {
        agent_id: "agent-123",
        agent_transcript_path: "/path/to/transcript.json",
        stop_hook_active: true,
      },
      undefined,
      { signal: new AbortController().signal },
    );

    expect(capture.stopTimestamp).toBeTypeOf("number");
    expect(capture.transcriptPath).toBe("/path/to/transcript.json");
    expect(capture.stopHookActive).toBe(true);
  });

  it("should handle stop without transcript path", async () => {
    const captureMap = new Map<string, SubagentCapture>();
    const capture: SubagentCapture = {
      agentId: "agent-456",
      agentType: "Bash",
      startTimestamp: Date.now() - 500,
    };
    captureMap.set("agent-456", capture);

    const hook = createSubagentStopHook(captureMap);

    await hook({ agent_id: "agent-456" }, undefined, {
      signal: new AbortController().signal,
    });

    expect(capture.stopTimestamp).toBeTypeOf("number");
    expect(capture.transcriptPath).toBeUndefined();
    expect(capture.stopHookActive).toBeUndefined();
  });

  it("should not modify capture if agentId not in map", async () => {
    const captureMap = new Map<string, SubagentCapture>();

    const hook = createSubagentStopHook(captureMap);

    await hook({ agent_id: "unknown-agent" }, undefined, {
      signal: new AbortController().signal,
    });

    expect(captureMap.size).toBe(0);
  });

  it("should return empty object to allow operation to proceed", async () => {
    const captureMap = new Map<string, SubagentCapture>();

    const hook = createSubagentStopHook(captureMap);

    const result = await hook({ agent_id: "agent-123" }, undefined, {
      signal: new AbortController().signal,
    });

    expect(result).toEqual({});
  });
});

describe("SubagentStart/SubagentStop hook correlation", () => {
  it("should correlate SubagentStart and SubagentStop hooks via captureMap", async () => {
    const captureMap = new Map<string, SubagentCapture>();
    const captures: SubagentCapture[] = [];
    const onCapture = (capture: SubagentCapture) => captures.push(capture);

    const startHook = createSubagentStartHook(captureMap, onCapture);
    const stopHook = createSubagentStopHook(captureMap);

    // Simulate SubagentStart
    await startHook(
      { agent_id: "agent-corr-123", agent_type: "Explore" },
      undefined,
      { signal: new AbortController().signal },
    );

    expect(captures).toHaveLength(1);
    expect(captures[0]!.stopTimestamp).toBeUndefined();

    // Simulate SubagentStop
    await stopHook(
      {
        agent_id: "agent-corr-123",
        agent_transcript_path: "/transcripts/agent-corr-123.json",
      },
      undefined,
      { signal: new AbortController().signal },
    );

    // The same capture object should be updated
    expect(captures[0]!.stopTimestamp).toBeTypeOf("number");
    expect(captures[0]!.transcriptPath).toBe(
      "/transcripts/agent-corr-123.json",
    );
  });

  it("should handle multiple concurrent subagents", async () => {
    const captureMap = new Map<string, SubagentCapture>();
    const captures: SubagentCapture[] = [];
    const onCapture = (capture: SubagentCapture) => captures.push(capture);

    const startHook = createSubagentStartHook(captureMap, onCapture);
    const stopHook = createSubagentStopHook(captureMap);

    // Start agent 1
    await startHook({ agent_id: "agent-1", agent_type: "Explore" }, undefined, {
      signal: new AbortController().signal,
    });

    // Start agent 2 before agent 1 finishes
    await startHook({ agent_id: "agent-2", agent_type: "Bash" }, undefined, {
      signal: new AbortController().signal,
    });

    expect(captures).toHaveLength(2);

    // Agent 2 finishes first
    await stopHook(
      { agent_id: "agent-2", agent_transcript_path: "/path/2.json" },
      undefined,
      { signal: new AbortController().signal },
    );

    // Agent 1 finishes second
    await stopHook(
      { agent_id: "agent-1", agent_transcript_path: "/path/1.json" },
      undefined,
      { signal: new AbortController().signal },
    );

    // Verify correct correlation
    expect(captures[0]!.agentType).toBe("Explore");
    expect(captures[0]!.transcriptPath).toBe("/path/1.json");

    expect(captures[1]!.agentType).toBe("Bash");
    expect(captures[1]!.transcriptPath).toBe("/path/2.json");
  });
});
