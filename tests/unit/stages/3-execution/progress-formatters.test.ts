/**
 * Tests for progress formatters.
 *
 * These functions provide shared formatting logic for progress reporters,
 * eliminating duplication across consoleProgress, verboseProgress, and
 * createSanitizedVerboseProgress.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionResult } from "../../../../src/types/index.js";

import {
  formatStageHeader,
  formatStageComplete,
  formatError,
  formatScenarioStart,
  formatScenarioResult,
  truncatePrompt,
} from "../../../../src/stages/3-execution/progress-formatters.js";

describe("formatStageHeader", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("outputs separator line, stage name in uppercase, and item count", () => {
    formatStageHeader("execution", 10);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("="));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("STAGE: EXECUTION (10 items)"),
    );
    expect(logSpy).toHaveBeenCalledTimes(3); // separator, stage line, separator
  });

  it("handles different stage names", () => {
    formatStageHeader("generation", 5);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("STAGE: GENERATION (5 items)"),
    );
  });

  it("handles zero items", () => {
    formatStageHeader("analysis", 0);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("STAGE: ANALYSIS (0 items)"),
    );
  });
});

describe("formatStageComplete", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("outputs stage completion with duration and count", () => {
    formatStageComplete("execution", 5000, 10);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("✅ execution complete: 10 items in 5.0s"),
    );
  });

  it("formats duration to one decimal place", () => {
    formatStageComplete("analysis", 1234, 3);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("1.2s"));
  });

  it("handles sub-second durations", () => {
    formatStageComplete("generation", 456, 2);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("0.5s"));
  });
});

describe("formatError", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("outputs error with scenario id when provided", () => {
    formatError(new Error("Test error"), "test-scenario");

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("❌ Error in test-scenario: Test error"),
    );
  });

  it("outputs error without scenario id when not provided", () => {
    formatError(new Error("Test error"));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("❌ Error: Test error"),
    );
  });

  it("handles undefined scenarioId explicitly", () => {
    formatError(new Error("Something failed"), undefined);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("❌ Error: Something failed"),
    );
  });
});

describe("formatScenarioStart", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("outputs scenario start with index (1-based), id, type, and expected trigger", () => {
    formatScenarioStart(
      {
        id: "test-scenario",
        component_type: "skill",
        expected_trigger: true,
        prompt: "test prompt",
      },
      0,
      10,
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[1/10] Starting: test-scenario"),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Type: skill"));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Expected: trigger"),
    );
  });

  it("shows 'no trigger' for expected_trigger: false", () => {
    formatScenarioStart(
      {
        id: "negative-test",
        component_type: "agent",
        expected_trigger: false,
        prompt: "some prompt",
      },
      4,
      10,
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Expected: no trigger"),
    );
  });

  it("outputs prompt when provided", () => {
    formatScenarioStart(
      {
        id: "test-scenario",
        component_type: "skill",
        expected_trigger: true,
        prompt: "How do I create a hook?",
      },
      0,
      1,
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Prompt: How do I create a hook?"),
    );
  });

  it("applies sanitizer to prompt when provided", () => {
    const sanitize = (s: string) => s.replace(/secret/gi, "[REDACTED]");

    formatScenarioStart(
      {
        id: "test-scenario",
        component_type: "skill",
        expected_trigger: true,
        prompt: "The secret password",
      },
      0,
      1,
      sanitize,
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Prompt: The [REDACTED] password"),
    );
  });
});

describe("formatScenarioResult", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("outputs PASSED status for successful results", () => {
    const result: ExecutionResult = {
      scenario_id: "test-scenario",
      transcript: { metadata: { version: "v3.0" }, events: [] },
      detected_tools: [],
      cost_usd: 0.0123,
      api_duration_ms: 456,
      num_turns: 2,
      permission_denials: [],
      errors: [],
    };

    formatScenarioResult(result);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("✅ PASSED"));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cost: $0.0123"),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Duration: 456ms"),
    );
  });

  it("outputs FAILED status for results with errors", () => {
    const result: ExecutionResult = {
      scenario_id: "test-scenario",
      transcript: { metadata: { version: "v3.0" }, events: [] },
      detected_tools: [],
      cost_usd: 0.01,
      api_duration_ms: 100,
      num_turns: 1,
      permission_denials: [],
      errors: ["Error occurred"],
    };

    formatScenarioResult(result);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("❌ FAILED"));
  });

  it("outputs detected tools when present", () => {
    const result: ExecutionResult = {
      scenario_id: "test-scenario",
      transcript: { metadata: { version: "v3.0" }, events: [] },
      detected_tools: [
        { name: "Skill", input: { skill: "test" } },
        { name: "Task", input: { task: "explore" } },
      ],
      cost_usd: 0.01,
      api_duration_ms: 100,
      num_turns: 1,
      permission_denials: [],
      errors: [],
    };

    formatScenarioResult(result);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Detected: Skill, Task"),
    );
  });

  it("outputs permission denials when present", () => {
    const result: ExecutionResult = {
      scenario_id: "test-scenario",
      transcript: { metadata: { version: "v3.0" }, events: [] },
      detected_tools: [],
      cost_usd: 0.01,
      api_duration_ms: 100,
      num_turns: 1,
      permission_denials: [
        { tool_name: "Write", tool_use_id: "tu_1", tool_input: {} },
        { tool_name: "Bash", tool_use_id: "tu_2", tool_input: {} },
      ],
      errors: [],
    };

    formatScenarioResult(result);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Denials: Write, Bash"),
    );
  });

  it("applies sanitizer to permission denials when provided", () => {
    const sanitize = (s: string) => s.replace(/user@test\.com/g, "[REDACTED]");

    const result: ExecutionResult = {
      scenario_id: "test-scenario",
      transcript: { metadata: { version: "v3.0" }, events: [] },
      detected_tools: [],
      cost_usd: 0.01,
      api_duration_ms: 100,
      num_turns: 1,
      permission_denials: [
        {
          tool_name: "Denied access for user@test.com",
          tool_use_id: "tu_1",
          tool_input: {},
        },
      ],
      errors: [],
    };

    formatScenarioResult(result, sanitize);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Denials: Denied access for [REDACTED]"),
    );
  });

  it("does not output detected tools when empty", () => {
    const result: ExecutionResult = {
      scenario_id: "test-scenario",
      transcript: { metadata: { version: "v3.0" }, events: [] },
      detected_tools: [],
      cost_usd: 0.01,
      api_duration_ms: 100,
      num_turns: 1,
      permission_denials: [],
      errors: [],
    };

    formatScenarioResult(result);

    const detectedCall = logSpy.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("Detected:"),
    );
    expect(detectedCall).toBeUndefined();
  });

  it("does not output permission denials when empty", () => {
    const result: ExecutionResult = {
      scenario_id: "test-scenario",
      transcript: { metadata: { version: "v3.0" }, events: [] },
      detected_tools: [],
      cost_usd: 0.01,
      api_duration_ms: 100,
      num_turns: 1,
      permission_denials: [],
      errors: [],
    };

    formatScenarioResult(result);

    const denialsCall = logSpy.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("Denials:"),
    );
    expect(denialsCall).toBeUndefined();
  });
});

describe("truncatePrompt", () => {
  it("returns prompt as-is when under max length", () => {
    const result = truncatePrompt("Short prompt", 50);

    expect(result).toBe("Short prompt");
  });

  it("truncates prompt and adds ellipsis when over max length", () => {
    const longPrompt = "A".repeat(100);
    const result = truncatePrompt(longPrompt, 50);

    expect(result).toBe("A".repeat(50) + "...");
    expect(result.length).toBe(53); // 50 + "..."
  });

  it("returns prompt as-is when exactly at max length", () => {
    const exactPrompt = "A".repeat(50);
    const result = truncatePrompt(exactPrompt, 50);

    expect(result).toBe(exactPrompt);
  });

  it("uses default max length from tuning config when not specified", () => {
    // Default is 80 from DEFAULT_TUNING.limits.prompt_display_length
    const longPrompt = "A".repeat(100);
    const result = truncatePrompt(longPrompt);

    expect(result).toBe("A".repeat(80) + "...");
  });
});
