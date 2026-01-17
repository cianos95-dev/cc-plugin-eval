/**
 * Unit tests for hooks-factory.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCaptureHooksConfig } from "../../../../src/stages/3-execution/hooks-factory.js";
import type {
  ToolCapture,
  SubagentCapture,
} from "../../../../src/types/index.js";
import type {
  OnToolCapture,
  OnSubagentCapture,
} from "../../../../src/stages/3-execution/tool-capture-hooks.js";

describe("hooks-factory", () => {
  describe("createCaptureHooksConfig", () => {
    let captureMap: Map<string, ToolCapture>;
    let subagentCaptureMap: Map<string, SubagentCapture>;
    let capturedTools: ToolCapture[];
    let capturedSubagents: SubagentCapture[];
    let onToolCapture: OnToolCapture;
    let onSubagentCapture: OnSubagentCapture;

    beforeEach(() => {
      captureMap = new Map();
      subagentCaptureMap = new Map();
      capturedTools = [];
      capturedSubagents = [];
      onToolCapture = (capture: ToolCapture) => capturedTools.push(capture);
      onSubagentCapture = (capture: SubagentCapture) =>
        capturedSubagents.push(capture);
    });

    it("returns SDK-compatible hooks configuration with PascalCase keys", () => {
      const hooksConfig = createCaptureHooksConfig({
        captureMap,
        onToolCapture,
        subagentCaptureMap,
        onSubagentCapture,
      });

      // Verify PascalCase keys (SDK format)
      expect(hooksConfig).toHaveProperty("PreToolUse");
      expect(hooksConfig).toHaveProperty("PostToolUse");
      expect(hooksConfig).toHaveProperty("PostToolUseFailure");
      expect(hooksConfig).toHaveProperty("SubagentStart");
      expect(hooksConfig).toHaveProperty("SubagentStop");
    });

    it("creates hook arrays with matcher and hooks properties", () => {
      const hooksConfig = createCaptureHooksConfig({
        captureMap,
        onToolCapture,
        subagentCaptureMap,
        onSubagentCapture,
      });

      // Each hook type should have an array with one entry
      expect(hooksConfig.PreToolUse).toHaveLength(1);
      expect(hooksConfig.PostToolUse).toHaveLength(1);
      expect(hooksConfig.PostToolUseFailure).toHaveLength(1);
      expect(hooksConfig.SubagentStart).toHaveLength(1);
      expect(hooksConfig.SubagentStop).toHaveLength(1);

      // Each entry should have matcher ".*" to capture all tools
      expect(hooksConfig.PreToolUse[0]).toHaveProperty("matcher", ".*");
      expect(hooksConfig.PostToolUse[0]).toHaveProperty("matcher", ".*");
      expect(hooksConfig.PostToolUseFailure[0]).toHaveProperty("matcher", ".*");
      expect(hooksConfig.SubagentStart[0]).toHaveProperty("matcher", ".*");
      expect(hooksConfig.SubagentStop[0]).toHaveProperty("matcher", ".*");
    });

    it("creates hooks arrays with hook callbacks", () => {
      const hooksConfig = createCaptureHooksConfig({
        captureMap,
        onToolCapture,
        subagentCaptureMap,
        onSubagentCapture,
      });

      // Each entry should have a hooks array with at least one callback
      expect(hooksConfig.PreToolUse[0].hooks).toHaveLength(1);
      expect(hooksConfig.PostToolUse[0].hooks).toHaveLength(1);
      expect(hooksConfig.PostToolUseFailure[0].hooks).toHaveLength(1);
      expect(hooksConfig.SubagentStart[0].hooks).toHaveLength(1);
      expect(hooksConfig.SubagentStop[0].hooks).toHaveLength(1);

      // All hook callbacks should be functions
      expect(typeof hooksConfig.PreToolUse[0].hooks[0]).toBe("function");
      expect(typeof hooksConfig.PostToolUse[0].hooks[0]).toBe("function");
      expect(typeof hooksConfig.PostToolUseFailure[0].hooks[0]).toBe(
        "function",
      );
      expect(typeof hooksConfig.SubagentStart[0].hooks[0]).toBe("function");
      expect(typeof hooksConfig.SubagentStop[0].hooks[0]).toBe("function");
    });

    it("PreToolUse hook captures tool invocation and calls onToolCapture", async () => {
      const hooksConfig = createCaptureHooksConfig({
        captureMap,
        onToolCapture,
        subagentCaptureMap,
        onSubagentCapture,
      });

      const preToolUseHook = hooksConfig.PreToolUse[0].hooks[0];
      // Cast to unknown to bypass strict type checking for test input
      const input = {
        tool_name: "Read",
        tool_input: { file_path: "/test.ts" },
      } as unknown;
      const toolUseId = "test-tool-use-id";

      await preToolUseHook(input, toolUseId, undefined);

      // Should have called onToolCapture with capture data
      expect(capturedTools).toHaveLength(1);
      const capture = capturedTools[0];
      expect(capture.name).toBe("Read");
      expect(capture.input).toEqual({ file_path: "/test.ts" });
      expect(capture.toolUseId).toBe(toolUseId);
      expect(typeof capture.timestamp).toBe("number");

      // Should have stored in captureMap for correlation
      expect(captureMap.has(toolUseId)).toBe(true);
    });

    it("PostToolUse hook updates capture with success status", async () => {
      const hooksConfig = createCaptureHooksConfig({
        captureMap,
        onToolCapture,
        subagentCaptureMap,
        onSubagentCapture,
      });

      const preToolUseHook = hooksConfig.PreToolUse[0].hooks[0];
      const postToolUseHook = hooksConfig.PostToolUse[0].hooks[0];
      const toolUseId = "test-tool-use-id";

      // First, trigger PreToolUse to create the capture
      await preToolUseHook(
        { tool_name: "Read", tool_input: {} } as unknown,
        toolUseId,
        undefined,
      );

      // Then trigger PostToolUse
      await postToolUseHook(
        { tool_response: "file contents" } as unknown,
        toolUseId,
        undefined,
      );

      // Capture should be updated with success
      const capture = captureMap.get(toolUseId);
      expect(capture?.success).toBe(true);
      expect(capture?.result).toBe("file contents");
    });

    it("SubagentStart hook captures agent spawn and calls onSubagentCapture", async () => {
      const hooksConfig = createCaptureHooksConfig({
        captureMap,
        onToolCapture,
        subagentCaptureMap,
        onSubagentCapture,
      });

      const subagentStartHook = hooksConfig.SubagentStart[0].hooks[0];
      const input = {
        agent_id: "agent-123",
        agent_type: "Explore",
      } as unknown;

      await subagentStartHook(input, undefined, undefined);

      // Should have called onSubagentCapture
      expect(capturedSubagents).toHaveLength(1);
      const capture = capturedSubagents[0];
      expect(capture.agentId).toBe("agent-123");
      expect(capture.agentType).toBe("Explore");
      expect(typeof capture.startTimestamp).toBe("number");

      // Should have stored in subagentCaptureMap
      expect(subagentCaptureMap.has("agent-123")).toBe(true);
    });
  });
});
