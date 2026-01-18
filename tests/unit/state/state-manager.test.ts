/**
 * Tests for state management module.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AnalysisOutput,
  EvalConfig,
  EvaluationResult,
  ExecutionResult,
  TestScenario,
} from "../../../src/types/index.js";

// Mock the file-io module
vi.mock("../../../src/utils/file-io.js", () => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
  writeJsonAsync: vi.fn().mockResolvedValue(undefined),
  ensureDir: vi.fn(),
  generateRunId: vi.fn(() => "20240101-120000-mock"),
  getResultsDir: vi.fn((pluginName: string, runId?: string) => {
    const base = `${process.cwd()}/results/${pluginName}`;
    return runId ? `${base}/${runId}` : base;
  }),
}));

// Mock the logger
vi.mock("../../../src/utils/logging.js", () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock node:fs for findLatestRun and listRuns tests
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    readdirSync: vi.fn(actual.readdirSync),
    readFileSync: vi.fn(actual.readFileSync),
  };
});

import { existsSync, readdirSync, readFileSync } from "node:fs";

import {
  getStateFilePath,
  createPipelineState,
  saveState,
  loadState,
  findLatestRun,
  listRuns,
  updateStateAfterAnalysis,
  updateStateAfterGeneration,
  updateStateAfterExecution,
  updateStateAfterEvaluation,
  updateStateComplete,
  updateStateWithPartialExecutions,
  updateStateWithError,
  canResumeFrom,
  getNextStage,
  getFailedScenarios,
  getIncompleteScenarios,
  formatState,
  type PipelineState,
} from "../../../src/state/index.js";
import {
  readJson,
  writeJson,
  writeJsonAsync,
  ensureDir,
  generateRunId,
  getResultsDir,
} from "../../../src/utils/file-io.js";

describe("getStateFilePath", () => {
  it("returns correct path for plugin and run", () => {
    const result = getStateFilePath("my-plugin", "20240101-120000-abcd");
    expect(result).toBe("results/my-plugin/20240101-120000-abcd/state.json");
  });
});

describe("createPipelineState", () => {
  it("creates state with provided options", () => {
    const config = { plugin: { path: "/test" } } as EvalConfig;
    const state = createPipelineState({
      pluginName: "test-plugin",
      config,
      runId: "test-run-123",
    });

    expect(state.run_id).toBe("test-run-123");
    expect(state.plugin_name).toBe("test-plugin");
    expect(state.stage).toBe("pending");
    expect(state.config).toBe(config);
    expect(state.timestamp).toBeDefined();
  });

  it("generates run ID if not provided", () => {
    const config = { plugin: { path: "/test" } } as EvalConfig;
    const state = createPipelineState({
      pluginName: "test-plugin",
      config,
    });

    expect(state.run_id).toMatch(/^\d{8}-\d{6}-[a-zA-Z0-9_-]{4}$/);
  });
});

describe("saveState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves state to correct path", async () => {
    const state: PipelineState = {
      run_id: "test-run-123",
      plugin_name: "test-plugin",
      stage: "analysis",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const result = await saveState(state);

    expect(ensureDir).toHaveBeenCalledWith(
      `${process.cwd()}/results/test-plugin/test-run-123`,
    );
    expect(writeJsonAsync).toHaveBeenCalled();
    expect(result).toBe("results/test-plugin/test-run-123/state.json");
  });

  it("updates timestamp when saving", async () => {
    const state: PipelineState = {
      run_id: "test-run-123",
      plugin_name: "test-plugin",
      stage: "pending",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    await saveState(state);

    const savedState = (writeJsonAsync as ReturnType<typeof vi.fn>).mock
      .calls[0][1];
    expect(savedState.timestamp).not.toBe("2024-01-01T00:00:00.000Z");
  });
});

describe("loadState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads state from correct path", () => {
    const mockState: PipelineState = {
      run_id: "test-run-123",
      plugin_name: "test-plugin",
      stage: "analysis",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    vi.mocked(readJson).mockReturnValue(mockState);

    const result = loadState("test-plugin", "test-run-123");

    expect(readJson).toHaveBeenCalledWith(
      "results/test-plugin/test-run-123/state.json",
    );
    expect(result).toEqual(mockState);
  });

  it("returns null when state not found", () => {
    vi.mocked(readJson).mockImplementation(() => {
      throw new Error("File not found");
    });

    const result = loadState("test-plugin", "nonexistent-run");

    expect(result).toBeNull();
  });

  describe("backward compatibility migration", () => {
    it("migrates legacy state without hooks to include empty hooks", () => {
      // Legacy state from before hooks feature
      const legacyState = {
        run_id: "legacy-run",
        plugin_name: "test-plugin",
        stage: "analysis",
        timestamp: "2024-01-01T00:00:00.000Z",
        config: { plugin: { path: "/test" } } as EvalConfig,
        analysis: {
          plugin_name: "test-plugin",
          plugin_load_result: {} as never,
          components: {
            skills: [{ name: "skill1" } as never],
            agents: [{ name: "agent1" } as never],
            commands: [],
            // NO hooks field (legacy state)
          },
          trigger_understanding: {
            skills: { skill1: { triggers: ["test"], description: "test" } },
            agents: { agent1: { examples: [], description: "test" } },
            commands: {},
            // NO hooks field (legacy state)
          },
        },
      };

      vi.mocked(readJson).mockReturnValue(legacyState);

      const result = loadState("test-plugin", "legacy-run");

      expect(result).not.toBeNull();
      expect(result?.analysis?.components.hooks).toEqual([]);
      expect(result?.analysis?.trigger_understanding.hooks).toEqual({});
    });

    it("returns state unchanged when hooks field already exists", () => {
      const modernState = {
        run_id: "modern-run",
        plugin_name: "test-plugin",
        stage: "analysis",
        timestamp: "2024-01-01T00:00:00.000Z",
        config: { plugin: { path: "/test" } } as EvalConfig,
        analysis: {
          plugin_name: "test-plugin",
          plugin_load_result: {} as never,
          components: {
            skills: [],
            agents: [],
            commands: [],
            hooks: [], // Already present
          },
          trigger_understanding: {
            skills: {},
            agents: {},
            commands: {},
            hooks: {}, // Already present
          },
        },
      };

      vi.mocked(readJson).mockReturnValue(modernState);

      const result = loadState("test-plugin", "modern-run");

      expect(result).not.toBeNull();
      expect(result?.analysis?.components.hooks).toEqual([]);
      expect(result?.analysis?.trigger_understanding.hooks).toEqual({});
    });

    it("returns state unchanged when analysis is missing", () => {
      const earlyState = {
        run_id: "early-run",
        plugin_name: "test-plugin",
        stage: "pending",
        timestamp: "2024-01-01T00:00:00.000Z",
        config: { plugin: { path: "/test" } } as EvalConfig,
        // NO analysis field (early pipeline stage)
      };

      vi.mocked(readJson).mockReturnValue(earlyState);

      const result = loadState("test-plugin", "early-run");

      expect(result).not.toBeNull();
      expect(result?.analysis).toBeUndefined();
    });

    it("preserves existing hooks data when present", () => {
      const stateWithHooks = {
        run_id: "hooks-run",
        plugin_name: "test-plugin",
        stage: "analysis",
        timestamp: "2024-01-01T00:00:00.000Z",
        config: { plugin: { path: "/test" } } as EvalConfig,
        analysis: {
          plugin_name: "test-plugin",
          plugin_load_result: {} as never,
          components: {
            skills: [],
            agents: [],
            commands: [],
            hooks: [{ name: "hook1", eventType: "PreToolUse" } as never],
          },
          trigger_understanding: {
            skills: {},
            agents: {},
            commands: {},
            hooks: {
              hook1: { eventType: "PreToolUse", matcher: ".*" } as never,
            },
          },
        },
      };

      vi.mocked(readJson).mockReturnValue(stateWithHooks);

      const result = loadState("test-plugin", "hooks-run");

      expect(result?.analysis?.components.hooks).toHaveLength(1);
      expect(result?.analysis?.components.hooks[0]).toEqual({
        name: "hook1",
        eventType: "PreToolUse",
      });
      expect(result?.analysis?.trigger_understanding.hooks.hook1).toBeDefined();
    });
  });
});

describe("updateStateAfterAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates state with analysis output", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "pending",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const analysis: AnalysisOutput = {
      plugin_name: "test-plugin",
      plugin_path: "/test",
      components: {
        skills: [],
        agents: [],
        commands: [],
      },
    };

    const result = updateStateAfterAnalysis(state, analysis);

    expect(result.stage).toBe("analysis");
    expect(result.analysis).toBe(analysis);
  });

  it("is a pure function (does not persist state)", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "pending",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const analysis: AnalysisOutput = {
      plugin_name: "test-plugin",
      plugin_path: "/test",
      components: {
        skills: [],
        agents: [],
        commands: [],
      },
    };

    updateStateAfterAnalysis(state, analysis);

    // Should NOT call writeJson (caller is responsible for persistence)
    expect(writeJson).not.toHaveBeenCalled();
  });

  it("updates timestamp", () => {
    const originalTimestamp = "2024-01-01T00:00:00.000Z";
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "pending",
      timestamp: originalTimestamp,
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const result = updateStateAfterAnalysis(state, {
      plugin_name: "test-plugin",
      plugin_path: "/test",
      components: { skills: [], agents: [], commands: [] },
    });

    expect(result.timestamp).not.toBe(originalTimestamp);
  });
});

describe("updateStateAfterGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates state with scenarios", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "analysis",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const scenarios: TestScenario[] = [
      {
        id: "scenario-1",
        prompt: "test prompt",
        expected_component: "skill-a",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
    ];

    const result = updateStateAfterGeneration(state, scenarios);

    expect(result.stage).toBe("generation");
    expect(result.scenarios).toBe(scenarios);
  });

  it("is a pure function (does not persist state)", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "analysis",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    updateStateAfterGeneration(state, []);

    // Should NOT call writeJson (caller is responsible for persistence)
    expect(writeJson).not.toHaveBeenCalled();
  });
});

describe("updateStateAfterExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates state with executions", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "generation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const executions: ExecutionResult[] = [
      {
        scenario_id: "scenario-1",
        transcript: { metadata: { version: "v3.0" }, events: [] },
        detected_tools: [],
        cost_usd: 0.01,
        api_duration_ms: 100,
        num_turns: 1,
        permission_denials: 0,
        errors: [],
      },
    ];

    const result = updateStateAfterExecution(state, executions);

    expect(result.stage).toBe("execution");
    expect(result.executions).toBe(executions);
    expect(result.failed_scenario_ids).toBeUndefined();
  });

  it("tracks failed scenario IDs", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "generation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const executions: ExecutionResult[] = [
      {
        scenario_id: "scenario-1",
        transcript: { metadata: { version: "v3.0" }, events: [] },
        detected_tools: [],
        cost_usd: 0.01,
        api_duration_ms: 100,
        num_turns: 1,
        permission_denials: 0,
        errors: ["Error occurred"],
      },
      {
        scenario_id: "scenario-2",
        transcript: { metadata: { version: "v3.0" }, events: [] },
        detected_tools: [],
        cost_usd: 0.01,
        api_duration_ms: 100,
        num_turns: 1,
        permission_denials: 0,
        errors: [],
      },
    ];

    const result = updateStateAfterExecution(state, executions);

    expect(result.failed_scenario_ids).toEqual(["scenario-1"]);
  });

  it("is a pure function (does not persist state)", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "generation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    updateStateAfterExecution(state, []);

    // Should NOT call writeJson (caller is responsible for persistence)
    expect(writeJson).not.toHaveBeenCalled();
  });
});

describe("updateStateAfterEvaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates state with evaluations", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const evaluations: EvaluationResult[] = [
      {
        scenario_id: "scenario-1",
        triggered: true,
        confidence: 100,
        quality_score: 8,
        evidence: [],
        issues: [],
        summary: "Test",
        detection_source: "programmatic",
        all_triggered_components: [],
        has_conflict: false,
        conflict_severity: "none",
      },
    ];

    const result = updateStateAfterEvaluation(state, evaluations);

    expect(result.stage).toBe("evaluation");
    expect(result.evaluations).toBe(evaluations);
  });

  it("is a pure function (does not persist state)", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    updateStateAfterEvaluation(state, []);

    // Should NOT call writeJson (caller is responsible for persistence)
    expect(writeJson).not.toHaveBeenCalled();
  });
});

describe("updateStateComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks state as complete", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "evaluation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const result = updateStateComplete(state);

    expect(result.stage).toBe("complete");
  });

  it("is a pure function (does not persist state)", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "evaluation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    updateStateComplete(state);

    // Should NOT call writeJson (caller is responsible for persistence)
    expect(writeJson).not.toHaveBeenCalled();
  });
});

describe("updateStateWithPartialExecutions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves partial execution results", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "generation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const partials: ExecutionResult[] = [
      {
        scenario_id: "scenario-1",
        transcript: { metadata: { version: "v3.0" }, events: [] },
        detected_tools: [],
        cost_usd: 0.01,
        api_duration_ms: 100,
        num_turns: 1,
        permission_denials: 0,
        errors: [],
      },
    ];

    const result = updateStateWithPartialExecutions(state, partials);

    expect(result.partial_executions).toBe(partials);
  });

  it("is a pure function (does not persist state)", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "generation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    updateStateWithPartialExecutions(state, []);

    // Should NOT call writeJson (caller is responsible for persistence)
    expect(writeJson).not.toHaveBeenCalled();
  });
});

describe("updateStateWithError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves error message", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const result = updateStateWithError(state, "Something went wrong");

    expect(result.error).toBe("Something went wrong");
  });

  it("is a pure function (does not persist state)", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    updateStateWithError(state, "Error message");

    // Should NOT call writeJson (caller is responsible for persistence)
    expect(writeJson).not.toHaveBeenCalled();
  });
});

describe("canResumeFrom", () => {
  const baseState: PipelineState = {
    run_id: "test-run",
    plugin_name: "test-plugin",
    stage: "complete",
    timestamp: "2024-01-01T00:00:00.000Z",
    config: { plugin: { path: "/test" } } as EvalConfig,
    analysis: {
      plugin_name: "test-plugin",
      plugin_path: "/test",
      components: { skills: [], agents: [], commands: [] },
    },
    scenarios: [],
    executions: [],
    evaluations: [],
  };

  it("returns true for pending stage", () => {
    expect(canResumeFrom(baseState, "pending")).toBe(true);
  });

  it("returns true for analysis stage", () => {
    expect(canResumeFrom(baseState, "analysis")).toBe(true);
  });

  it("returns true for generation if analysis exists", () => {
    expect(canResumeFrom(baseState, "generation")).toBe(true);
  });

  it("returns false for generation if no analysis", () => {
    const state = { ...baseState, analysis: undefined };
    expect(canResumeFrom(state, "generation")).toBe(false);
  });

  it("returns true for execution if analysis and scenarios exist", () => {
    expect(canResumeFrom(baseState, "execution")).toBe(true);
  });

  it("returns false for execution if no scenarios", () => {
    const state = { ...baseState, scenarios: undefined };
    expect(canResumeFrom(state, "execution")).toBe(false);
  });

  it("returns true for evaluation if all data exists", () => {
    expect(canResumeFrom(baseState, "evaluation")).toBe(true);
  });

  it("returns false for evaluation if no executions", () => {
    const state = { ...baseState, executions: undefined };
    expect(canResumeFrom(state, "evaluation")).toBe(false);
  });

  it("returns true for complete only if already complete", () => {
    expect(canResumeFrom(baseState, "complete")).toBe(true);
    expect(
      canResumeFrom({ ...baseState, stage: "execution" }, "complete"),
    ).toBe(false);
  });
});

describe("getNextStage", () => {
  it("returns analysis after pending", () => {
    expect(getNextStage("pending")).toBe("analysis");
  });

  it("returns generation after analysis", () => {
    expect(getNextStage("analysis")).toBe("generation");
  });

  it("returns execution after generation", () => {
    expect(getNextStage("generation")).toBe("execution");
  });

  it("returns evaluation after execution", () => {
    expect(getNextStage("execution")).toBe("evaluation");
  });

  it("returns complete after evaluation", () => {
    expect(getNextStage("evaluation")).toBe("complete");
  });

  it("returns null after complete", () => {
    expect(getNextStage("complete")).toBeNull();
  });
});

describe("getFailedScenarios", () => {
  it("returns failed scenarios from state", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      failed_scenario_ids: ["scenario-1", "scenario-3"],
    };

    const allScenarios: TestScenario[] = [
      {
        id: "scenario-1",
        prompt: "test",
        expected_component: "a",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
      {
        id: "scenario-2",
        prompt: "test",
        expected_component: "b",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
      {
        id: "scenario-3",
        prompt: "test",
        expected_component: "c",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
    ];

    const result = getFailedScenarios(state, allScenarios);

    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(["scenario-1", "scenario-3"]);
  });

  it("returns empty array if no failed scenarios", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const allScenarios: TestScenario[] = [
      {
        id: "scenario-1",
        prompt: "test",
        expected_component: "a",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
    ];

    expect(getFailedScenarios(state, allScenarios)).toEqual([]);
  });
});

describe("getIncompleteScenarios", () => {
  it("returns scenarios not in executions", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      executions: [
        {
          scenario_id: "scenario-1",
          transcript: { metadata: { version: "v3.0" }, events: [] },
          detected_tools: [],
          cost_usd: 0,
          api_duration_ms: 0,
          num_turns: 0,
          permission_denials: 0,
          errors: [],
        },
      ],
    };

    const allScenarios: TestScenario[] = [
      {
        id: "scenario-1",
        prompt: "test",
        expected_component: "a",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
      {
        id: "scenario-2",
        prompt: "test",
        expected_component: "b",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
    ];

    const result = getIncompleteScenarios(state, allScenarios);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("scenario-2");
  });

  it("includes partial executions in completed set", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      partial_executions: [
        {
          scenario_id: "scenario-1",
          transcript: { metadata: { version: "v3.0" }, events: [] },
          detected_tools: [],
          cost_usd: 0,
          api_duration_ms: 0,
          num_turns: 0,
          permission_denials: 0,
          errors: [],
        },
      ],
    };

    const allScenarios: TestScenario[] = [
      {
        id: "scenario-1",
        prompt: "test",
        expected_component: "a",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
      {
        id: "scenario-2",
        prompt: "test",
        expected_component: "b",
        component_type: "skill",
        scenario_type: "direct",
        expected_trigger: true,
      },
    ];

    const result = getIncompleteScenarios(state, allScenarios);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("scenario-2");
  });
});

describe("formatState", () => {
  it("formats basic state information", () => {
    const state: PipelineState = {
      run_id: "test-run-123",
      plugin_name: "test-plugin",
      stage: "analysis",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
    };

    const result = formatState(state);

    expect(result).toContain("Run ID: test-run-123");
    expect(result).toContain("Plugin: test-plugin");
    expect(result).toContain("Stage: analysis");
    expect(result).toContain("Last Updated: 2024-01-01T00:00:00.000Z");
  });

  it("includes component count when analysis exists", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "analysis",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      analysis: {
        plugin_name: "test-plugin",
        plugin_path: "/test",
        components: {
          skills: [{ name: "s1" } as never, { name: "s2" } as never],
          agents: [{ name: "a1" } as never],
          commands: [],
          hooks: [],
        },
      },
    };

    const result = formatState(state);

    expect(result).toContain("Components: 3");
  });

  it("includes scenario count when scenarios exist", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "generation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      scenarios: [{ id: "s1" } as TestScenario, { id: "s2" } as TestScenario],
    };

    const result = formatState(state);

    expect(result).toContain("Scenarios: 2");
  });

  it("includes execution stats when executions exist", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      executions: [
        { scenario_id: "s1", errors: [] } as ExecutionResult,
        { scenario_id: "s2", errors: ["error"] } as ExecutionResult,
      ],
    };

    const result = formatState(state);

    expect(result).toContain("Executions: 1/2 passed");
  });

  it("includes evaluation stats when evaluations exist", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "evaluation",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      evaluations: [
        { scenario_id: "s1", triggered: true } as EvaluationResult,
        { scenario_id: "s2", triggered: false } as EvaluationResult,
      ],
    };

    const result = formatState(state);

    expect(result).toContain("Evaluations: 1/2 triggered");
  });

  it("includes failed scenario count", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      failed_scenario_ids: ["s1", "s2", "s3"],
    };

    const result = formatState(state);

    expect(result).toContain("Failed Scenarios: 3");
  });

  it("includes error message", () => {
    const state: PipelineState = {
      run_id: "test-run",
      plugin_name: "test-plugin",
      stage: "execution",
      timestamp: "2024-01-01T00:00:00.000Z",
      config: { plugin: { path: "/test" } } as EvalConfig,
      error: "Pipeline failed due to timeout",
    };

    const result = formatState(state);

    expect(result).toContain("Error: Pipeline failed due to timeout");
  });
});

describe("findLatestRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when plugin directory does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = findLatestRun("nonexistent-plugin");

    expect(result).toBeNull();
    expect(existsSync).toHaveBeenCalledWith("results/nonexistent-plugin");
  });

  it("returns null when no run directories exist", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);

    const result = findLatestRun("empty-plugin");

    expect(result).toBeNull();
  });

  it("skips directories that don't match run ID pattern", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: "temp", isDirectory: () => true },
      { name: ".DS_Store", isDirectory: () => false },
      { name: "invalid-folder", isDirectory: () => true },
    ] as unknown as ReturnType<typeof readdirSync>);

    const result = findLatestRun("test-plugin");

    expect(result).toBeNull();
  });

  it("skips run directories without state.json", () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path === "results/test-plugin") return true;
      // No state.json files exist
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue([
      { name: "20240101-120000-abcd", isDirectory: () => true },
      { name: "20240102-120000-efgh", isDirectory: () => true },
    ] as unknown as ReturnType<typeof readdirSync>);

    const result = findLatestRun("test-plugin");

    expect(result).toBeNull();
  });

  it("returns most recent run with valid state file", () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path === "results/test-plugin") return true;
      // Most recent run missing state.json
      if (path === "results/test-plugin/20240103-120000-ijkl/state.json")
        return false;
      // Second most recent has state.json
      if (path === "results/test-plugin/20240102-120000-efgh/state.json")
        return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue([
      { name: "20240101-120000-abcd", isDirectory: () => true },
      { name: "20240102-120000-efgh", isDirectory: () => true },
      { name: "20240103-120000-ijkl", isDirectory: () => true },
    ] as unknown as ReturnType<typeof readdirSync>);

    const result = findLatestRun("test-plugin");

    // Should return 2nd most recent since most recent has no state file
    expect(result).toBe("20240102-120000-efgh");
  });

  it("filters out non-directory entries", () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path === "results/test-plugin") return true;
      if (path === "results/test-plugin/20240101-120000-abcd/state.json")
        return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue([
      { name: "20240101-120000-abcd", isDirectory: () => true },
      { name: "20240102-120000-efgh.txt", isDirectory: () => false },
    ] as unknown as ReturnType<typeof readdirSync>);

    const result = findLatestRun("test-plugin");

    expect(result).toBe("20240101-120000-abcd");
  });
});

describe("listRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when plugin directory does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = listRuns("nonexistent-plugin");

    expect(result).toEqual([]);
    expect(existsSync).toHaveBeenCalledWith("results/nonexistent-plugin");
  });

  it("skips non-directory entries", () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path === "results/test-plugin") return true;
      if (path === "results/test-plugin/20240101-120000-abcd/state.json")
        return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue([
      { name: "20240101-120000-abcd", isDirectory: () => true },
      { name: "some-file.txt", isDirectory: () => false },
      { name: "another-file.json", isDirectory: () => false },
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readJson).mockReturnValue({
      stage: "complete",
      timestamp: "2024-01-01T12:00:00.000Z",
    });

    const result = listRuns("test-plugin");

    expect(result).toHaveLength(1);
    expect(result[0]?.runId).toBe("20240101-120000-abcd");
  });

  it("skips directories with invalid run ID format", () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path === "results/test-plugin") return true;
      if (path === "results/test-plugin/20240101-120000-abcd/state.json")
        return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue([
      { name: "20240101-120000-abcd", isDirectory: () => true },
      { name: "temp-folder", isDirectory: () => true },
      { name: "invalid-format", isDirectory: () => true },
      { name: "backup", isDirectory: () => true },
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readJson).mockReturnValue({
      stage: "analysis",
      timestamp: "2024-01-01T12:00:00.000Z",
    });

    const result = listRuns("test-plugin");

    expect(result).toHaveLength(1);
    expect(result[0]?.runId).toBe("20240101-120000-abcd");
  });

  it("skips runs without state.json", () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path === "results/test-plugin") return true;
      if (path === "results/test-plugin/20240101-120000-abcd/state.json")
        return true;
      // Second run has no state.json
      if (path === "results/test-plugin/20240102-120000-efgh/state.json")
        return false;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue([
      { name: "20240101-120000-abcd", isDirectory: () => true },
      { name: "20240102-120000-efgh", isDirectory: () => true },
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readJson).mockReturnValue({
      stage: "complete",
      timestamp: "2024-01-01T12:00:00.000Z",
    });

    const result = listRuns("test-plugin");

    expect(result).toHaveLength(1);
    expect(result[0]?.runId).toBe("20240101-120000-abcd");
  });

  it("skips runs with corrupted state files", () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path === "results/test-plugin") return true;
      // Both runs have state.json
      return String(path).endsWith("state.json");
    });
    vi.mocked(readdirSync).mockReturnValue([
      { name: "20240101-120000-abcd", isDirectory: () => true },
      { name: "20240102-120000-efgh", isDirectory: () => true },
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readJson).mockImplementation((path) => {
      if (String(path).includes("20240101")) {
        return {
          stage: "complete",
          timestamp: "2024-01-01T12:00:00.000Z",
        };
      }
      // Second run throws error (simulating corrupted JSON)
      throw new Error("Invalid JSON");
    });

    const result = listRuns("test-plugin");

    expect(result).toHaveLength(1);
    expect(result[0]?.runId).toBe("20240101-120000-abcd");
  });

  it("handles state files with missing fields using defaults", () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path === "results/test-plugin") return true;
      return String(path).endsWith("state.json");
    });
    vi.mocked(readdirSync).mockReturnValue([
      { name: "20240101-120000-abcd", isDirectory: () => true },
    ] as unknown as ReturnType<typeof readdirSync>);
    // State file missing stage and timestamp fields
    vi.mocked(readJson).mockReturnValue({
      run_id: "20240101-120000-abcd",
      plugin_name: "test-plugin",
    });

    const result = listRuns("test-plugin");

    expect(result).toHaveLength(1);
    expect(result[0]?.runId).toBe("20240101-120000-abcd");
    // Should use defaults when fields are missing
    expect(result[0]?.stage).toBe("pending");
    expect(result[0]?.timestamp).toBe("");
  });

  it("sorts runs in reverse chronological order", () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      if (path === "results/test-plugin") return true;
      return String(path).endsWith("state.json");
    });
    vi.mocked(readdirSync).mockReturnValue([
      { name: "20240101-120000-abcd", isDirectory: () => true },
      { name: "20240103-120000-ijkl", isDirectory: () => true },
      { name: "20240102-120000-efgh", isDirectory: () => true },
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readJson).mockImplementation((path) => {
      const match = String(path).match(/(\d{8}-\d{6})/);
      const runId = match ? match[1] : "";
      return {
        stage: "complete",
        timestamp: `2024-01-0${runId.charAt(6)}T12:00:00.000Z`,
      };
    });

    const result = listRuns("test-plugin");

    expect(result).toHaveLength(3);
    // Most recent first
    expect(result[0]?.runId).toBe("20240103-120000-ijkl");
    expect(result[1]?.runId).toBe("20240102-120000-efgh");
    expect(result[2]?.runId).toBe("20240101-120000-abcd");
  });
});
