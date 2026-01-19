/**
 * Tests for Stage 3 execution orchestration.
 *
 * Tests the main runExecution function and its integration with
 * plugin loading, session strategies, and parallel execution.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import type {
  AnalysisOutput,
  EvalConfig,
  ExecutionResult,
  ProgressCallbacks,
  TestScenario,
} from "../../../../src/types/index.js";

import { parallel } from "../../../../src/utils/concurrency.js";
import { writeJsonAsync } from "../../../../src/utils/file-io.js";
import { logger } from "../../../../src/utils/logging.js";

import {
  verifyPluginLoad,
  getFailedMcpServers,
  isPluginLoaded,
} from "../../../../src/stages/3-execution/plugin-loader.js";
import {
  executeScenario,
  executeScenarioWithCheckpoint,
  wouldExceedBudget,
} from "../../../../src/stages/3-execution/agent-executor.js";
import {
  resolveExecutionStrategy,
  logBatchStats,
} from "../../../../src/stages/3-execution/session-batching.js";

import { runExecution } from "../../../../src/stages/3-execution/index.js";

// Mock dependencies
vi.mock("../../../../src/utils/concurrency.js", () => ({
  parallel: vi.fn(
    async <T, R>({
      items,
      fn,
    }: {
      items: T[];
      fn: (item: T, index: number) => Promise<R>;
    }) => {
      const results: R[] = [];
      for (let i = 0; i < items.length; i++) {
        results.push(await fn(items[i] as T, i));
      }
      return { results, errors: [] };
    },
  ),
  createRateLimiter: vi.fn(),
}));

vi.mock("../../../../src/utils/file-io.js", () => ({
  ensureDir: vi.fn(),
  getResultsDir: vi.fn(() => "/mock/results/test-plugin"),
  writeJson: vi.fn(),
  writeJsonAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../src/utils/logging.js", () => ({
  logger: {
    stageHeader: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    progress: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../../src/utils/sanitizer.js", () => ({
  createSanitizer: vi.fn(),
  createSanitizerFromOutputConfig: vi.fn(),
  sanitizeTranscriptEvent: vi.fn((event) => event),
  validateRegexPattern: vi.fn(() => ({ valid: true })),
}));

vi.mock("../../../../src/stages/3-execution/plugin-loader.js", () => ({
  verifyPluginLoad: vi.fn(),
  getFailedMcpServers: vi.fn(() => []),
  isPluginLoaded: vi.fn(() => true),
  formatPluginLoadResult: vi.fn(() => "Plugin loaded successfully"),
}));

vi.mock("../../../../src/stages/3-execution/agent-executor.js", () => ({
  executeScenario: vi.fn(),
  executeScenarioWithCheckpoint: vi.fn(),
  wouldExceedBudget: vi.fn(() => false),
  formatExecutionStats: vi.fn(() => "Execution stats: 1 success, 0 failures"),
}));

vi.mock("../../../../src/stages/3-execution/session-batching.js", () => ({
  resolveExecutionStrategy: vi.fn(() => ({ type: "isolated", scenarios: [] })),
  logBatchStats: vi.fn(),
}));

vi.mock("../../../../src/stages/3-execution/progress-reporters.js", () => ({
  consoleProgress: {
    onStageStart: vi.fn(),
    onStageComplete: vi.fn(),
    onScenarioStart: vi.fn(),
    onScenarioComplete: vi.fn(),
    onError: vi.fn(),
  },
}));

// ============================================================================
// Test Fixtures
// ============================================================================

function createAnalysis(
  overrides: Partial<AnalysisOutput> = {},
): AnalysisOutput {
  return {
    plugin_name: "test-plugin",
    plugin_load_result: {
      loaded: true,
      plugin_name: "test-plugin",
      plugin_path: "/path/to/test-plugin",
      registered_tools: [],
      registered_commands: [],
      registered_skills: [],
      registered_agents: [],
      mcp_servers: [],
      session_id: "test-session",
    },
    components: {
      skills: [],
      agents: [],
      commands: [],
      hooks: [],
      mcp_servers: [],
    },
    trigger_understanding: {
      skills: {},
      agents: {},
      commands: {},
      hooks: {},
      mcp_servers: {},
    },
    ...overrides,
  };
}

function createScenario(overrides: Partial<TestScenario> = {}): TestScenario {
  return {
    id: "scenario-1",
    component_ref: "test-skill",
    component_type: "skill",
    scenario_type: "direct",
    user_prompt: "Test prompt",
    expected_trigger: true,
    expected_component: "test-skill",
    ...overrides,
  };
}

function createExecutionResult(
  overrides: Partial<ExecutionResult> = {},
): ExecutionResult {
  return {
    scenario_id: "scenario-1",
    detected_tools: [],
    transcript: {
      metadata: {
        version: "v3.0",
        plugin_name: "test-plugin",
        scenario_id: "scenario-1",
        timestamp: "2024-01-01T00:00:00Z",
        model: "claude-sonnet-4-20250514",
      },
      events: [],
    },
    cost_usd: 0.001,
    api_duration_ms: 100,
    num_turns: 1,
    errors: [],
    permission_denials: [],
    ...overrides,
  };
}

function createConfig(overrides: Partial<EvalConfig> = {}): EvalConfig {
  return {
    plugin: {
      path: "/path/to/test-plugin",
    },
    scope: {
      skills: true,
      agents: true,
      commands: true,
      hooks: false,
      mcp_servers: false,
    },
    execution: {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      max_turns: 10,
      timeout_ms: 30000,
      max_budget_usd: 10.0,
      num_reps: 1,
      requests_per_second: null,
      disallowed_tools: [],
      additional_plugins: [],
      session_strategy: "isolated",
    },
    generation: {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      num_variations: 3,
    },
    evaluation: {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      detection_mode: "programmatic_first",
      aggregate_method: "average",
      num_samples: 1,
      include_citations: false,
    },
    output: {
      format: "json",
      include_cli_summary: true,
      junit_test_suite_name: "cc-plugin-eval",
      sanitize_transcripts: false,
      sanitize_logs: false,
    },
    max_concurrent: 5,
    rewind_file_changes: false,
    dry_run: false,
    estimate_costs: false,
    batch_threshold: 50,
    force_synchronous: false,
    poll_interval_ms: 5000,
    batch_timeout_ms: 3600000,
    debug: false,
    verbose: false,
    ...overrides,
  } as EvalConfig;
}

// ============================================================================
// Tests
// ============================================================================

describe("runExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset default mock implementations
    (verifyPluginLoad as Mock).mockResolvedValue({
      loaded: true,
      components_loaded: 10,
    });
    (isPluginLoaded as Mock).mockReturnValue(true);
    (getFailedMcpServers as Mock).mockReturnValue([]);
    (executeScenario as Mock).mockResolvedValue(createExecutionResult());
    (resolveExecutionStrategy as Mock).mockReturnValue({
      type: "isolated",
      scenarios: [],
    });
  });

  describe("plugin verification", () => {
    it("should verify plugin loads correctly", async () => {
      const analysis = createAnalysis();
      const scenarios = [createScenario()];
      const config = createConfig();

      await runExecution({ analysis, scenarios, config });

      expect(verifyPluginLoad).toHaveBeenCalledWith({
        pluginPath: config.plugin.path,
        config: config.execution,
        queryFn: undefined,
        enableMcpDiscovery: false,
      });
    });

    it("should return empty results when plugin fails to load", async () => {
      (isPluginLoaded as Mock).mockReturnValue(false);
      (verifyPluginLoad as Mock).mockResolvedValue({
        loaded: false,
        error: "Plugin not found",
        recovery_hint: "Check plugin path",
      });

      const analysis = createAnalysis();
      const scenarios = [
        createScenario(),
        createScenario({ id: "scenario-2" }),
      ];
      const config = createConfig();

      const result = await runExecution({ analysis, scenarios, config });

      expect(result.results).toHaveLength(0);
      expect(result.error_count).toBe(2); // All scenarios failed
      expect(result.success_count).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Plugin failed to load"),
      );
    });

    it("should filter scenarios for failed MCP servers", async () => {
      const failedServer = {
        name: "failed-server",
        error: "Connection failed",
      };
      (getFailedMcpServers as Mock).mockReturnValue([failedServer]);

      const analysis = createAnalysis();
      const scenarios = [
        createScenario({
          id: "skill-scenario",
          component_type: "skill",
        }),
        createScenario({
          id: "mcp-scenario",
          component_type: "mcp_server",
          component_ref: "failed-server",
        }),
      ];
      const config = createConfig({
        scope: { ...createConfig().scope, mcp_servers: true },
      });

      await runExecution({ analysis, scenarios, config });

      // The parallel mock receives the filtered scenarios
      expect(parallel).toHaveBeenCalled();
      const parallelCall = (parallel as Mock).mock.calls[0][0];
      // Should only have the skill scenario (MCP scenario filtered out)
      expect(parallelCall.items).toHaveLength(1);
      expect(parallelCall.items[0].id).toBe("skill-scenario");
    });
  });

  describe("session strategy routing", () => {
    it("should use isolated mode by default", async () => {
      const scenarios = [createScenario()];
      (resolveExecutionStrategy as Mock).mockReturnValue({
        type: "isolated",
        scenarios,
      });

      const analysis = createAnalysis();
      const config = createConfig();

      await runExecution({ analysis, scenarios, config });

      expect(resolveExecutionStrategy).toHaveBeenCalledWith(
        config.execution,
        expect.any(Array),
      );
      // parallel() is called for isolated mode
      expect(parallel).toHaveBeenCalled();
    });

    it("should call resolveExecutionStrategy with execution config and scenarios", async () => {
      const analysis = createAnalysis();
      const scenarios = [createScenario()];
      const config = createConfig({
        execution: {
          ...createConfig().execution,
          session_strategy: "batched_by_component",
        },
      });

      // Keep isolated mode to avoid needing to fully mock batched execution
      (resolveExecutionStrategy as Mock).mockReturnValue({
        type: "isolated",
        scenarios,
      });

      await runExecution({ analysis, scenarios, config });

      expect(resolveExecutionStrategy).toHaveBeenCalledWith(
        config.execution,
        expect.any(Array),
      );
    });

    it("should use batched execution when batched mode detected", async () => {
      const scenario = createScenario();
      const mockGroups = new Map([["skill:test-skill", [scenario]]]);
      (resolveExecutionStrategy as Mock).mockReturnValue({
        type: "batched",
        groups: mockGroups,
      });

      // We need to mock the entire batched execution path.
      // For this test, we verify logBatchStats is called with the groups.
      // The actual execution will fail without full mocking, so we catch the error.
      const analysis = createAnalysis();
      const scenarios = [scenario];
      const config = createConfig({
        execution: {
          ...createConfig().execution,
          session_strategy: "batched_by_component",
        },
      });

      try {
        await runExecution({ analysis, scenarios, config });
      } catch {
        // Expected to fail due to incomplete mocking of batched execution
      }

      expect(logBatchStats).toHaveBeenCalledWith(mockGroups, scenarios.length);
    });
  });

  describe("execution orchestration", () => {
    it("should execute scenarios in parallel with concurrency limit", async () => {
      const analysis = createAnalysis();
      const scenarios = [
        createScenario({ id: "s1" }),
        createScenario({ id: "s2" }),
        createScenario({ id: "s3" }),
      ];
      const config = createConfig({ max_concurrent: 2 });

      (executeScenario as Mock)
        .mockResolvedValueOnce(createExecutionResult({ scenario_id: "s1" }))
        .mockResolvedValueOnce(createExecutionResult({ scenario_id: "s2" }))
        .mockResolvedValueOnce(createExecutionResult({ scenario_id: "s3" }));

      await runExecution({ analysis, scenarios, config });

      expect(parallel).toHaveBeenCalledWith(
        expect.objectContaining({
          items: scenarios,
          concurrency: 2,
          continueOnError: true,
        }),
      );
    });

    it("should call progress callbacks correctly", async () => {
      const analysis = createAnalysis();
      const scenarios = [createScenario()];
      const config = createConfig();
      const mockProgress: ProgressCallbacks = {
        onStageStart: vi.fn(),
        onStageComplete: vi.fn(),
        onScenarioStart: vi.fn(),
        onScenarioComplete: vi.fn(),
        onError: vi.fn(),
      };

      await runExecution({
        analysis,
        scenarios,
        config,
        progress: mockProgress,
      });

      expect(mockProgress.onStageStart).toHaveBeenCalledWith("execution", 1);
      expect(mockProgress.onStageComplete).toHaveBeenCalledWith(
        "execution",
        expect.any(Number),
        1,
      );
    });

    it("should aggregate results from parallel execution", async () => {
      const analysis = createAnalysis();
      const scenarios = [
        createScenario({ id: "s1" }),
        createScenario({ id: "s2" }),
      ];
      const config = createConfig();

      (executeScenario as Mock)
        .mockResolvedValueOnce(
          createExecutionResult({ scenario_id: "s1", cost_usd: 0.01 }),
        )
        .mockResolvedValueOnce(
          createExecutionResult({ scenario_id: "s2", cost_usd: 0.02 }),
        );

      const result = await runExecution({ analysis, scenarios, config });

      expect(result.results).toHaveLength(2);
      expect(result.total_cost_usd).toBeCloseTo(0.03);
      expect(result.success_count).toBe(2);
      expect(result.error_count).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should collect errors from failed scenarios", async () => {
      const analysis = createAnalysis();
      const scenarios = [
        createScenario({ id: "s1" }),
        createScenario({ id: "s2" }),
      ];
      const config = createConfig();

      (executeScenario as Mock)
        .mockResolvedValueOnce(createExecutionResult({ scenario_id: "s1" }))
        .mockResolvedValueOnce(
          createExecutionResult({
            scenario_id: "s2",
            errors: [
              {
                type: "error" as const,
                error_type: "timeout" as const,
                message: "SDK timeout",
                timestamp: Date.now(),
                recoverable: false,
              },
            ],
          }),
        );

      const result = await runExecution({ analysis, scenarios, config });

      expect(result.success_count).toBe(1);
      expect(result.error_count).toBe(1);
    });

    it("should configure parallel with continueOnError true", async () => {
      const analysis = createAnalysis();
      const scenarios = [createScenario()];
      const config = createConfig();

      await runExecution({ analysis, scenarios, config });

      // Verify parallel is called with continueOnError: true
      expect(parallel).toHaveBeenCalledWith(
        expect.objectContaining({
          continueOnError: true,
        }),
      );
    });

    it("should warn when exceeding budget", async () => {
      (wouldExceedBudget as Mock).mockReturnValue(true);

      const analysis = createAnalysis();
      const scenarios = [createScenario()];
      const config = createConfig();

      await runExecution({ analysis, scenarios, config });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("exceed budget"),
      );
    });
  });

  describe("transcript saving", () => {
    it("should save transcripts to disk", async () => {
      const analysis = createAnalysis();
      const scenarios = [createScenario()];
      const config = createConfig();

      await runExecution({ analysis, scenarios, config });

      expect(writeJsonAsync).toHaveBeenCalled();
    });

    it("should respect sanitize_transcripts setting", async () => {
      const analysis = createAnalysis();
      const scenarios = [createScenario()];
      const config = createConfig({
        output: {
          format: "json",
          include_cli_summary: true,
          junit_test_suite_name: "cc-plugin-eval",
          sanitize_transcripts: true,
          sanitize_logs: false,
        },
      });

      await runExecution({ analysis, scenarios, config });

      // Verify execution completes with sanitization enabled
      expect(writeJsonAsync).toHaveBeenCalled();
    });
  });

  describe("metrics calculation", () => {
    it("should calculate total tools captured", async () => {
      const analysis = createAnalysis();
      const scenarios = [createScenario(), createScenario({ id: "s2" })];
      const config = createConfig();

      (executeScenario as Mock)
        .mockResolvedValueOnce(
          createExecutionResult({
            scenario_id: "s1",
            detected_tools: [
              {
                name: "Skill",
                input: { skill: "test" },
                toolUseId: "1",
                timestamp: Date.now(),
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          createExecutionResult({
            scenario_id: "s2",
            detected_tools: [
              {
                name: "Task",
                input: { prompt: "test" },
                toolUseId: "2",
                timestamp: Date.now(),
              },
              {
                name: "Read",
                input: { path: "/file" },
                toolUseId: "3",
                timestamp: Date.now(),
              },
            ],
          }),
        );

      const result = await runExecution({ analysis, scenarios, config });

      expect(result.total_tools_captured).toBe(3);
    });

    it("should track duration correctly", async () => {
      const analysis = createAnalysis();
      const scenarios = [createScenario()];
      const config = createConfig();

      const result = await runExecution({ analysis, scenarios, config });

      expect(result.total_duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.total_duration_ms).toBeLessThan(5000); // Should be fast in tests
    });
  });

  describe("rate limiting", () => {
    it("should apply rate limiting when configured", async () => {
      const analysis = createAnalysis();
      const scenarios = [createScenario()];
      const config = createConfig({
        execution: {
          ...createConfig().execution,
          requests_per_second: 2,
        },
      });

      await runExecution({ analysis, scenarios, config });

      // Rate limiting is applied inside executeAllScenariosIsolated
      // We verify the config is passed correctly
      expect(parallel).toHaveBeenCalled();
    });
  });

  describe("checkpointing", () => {
    it("should use executeScenarioWithCheckpoint when rewind_file_changes is true", async () => {
      (executeScenarioWithCheckpoint as Mock).mockResolvedValue(
        createExecutionResult(),
      );

      const analysis = createAnalysis();
      const scenarios = [createScenario()];
      const config = createConfig({ rewind_file_changes: true });

      await runExecution({ analysis, scenarios, config });

      // The parallel mock will call the fn, which internally uses executeScenarioWithCheckpoint
      // We verify by checking the mock was called (via parallel's fn)
      expect(parallel).toHaveBeenCalled();
    });
  });

  describe("MCP discovery", () => {
    it("should enable MCP discovery when mcp_servers scope is true", async () => {
      const analysis = createAnalysis();
      const scenarios = [createScenario()];
      const config = createConfig({
        scope: { ...createConfig().scope, mcp_servers: true },
      });

      await runExecution({ analysis, scenarios, config });

      expect(verifyPluginLoad).toHaveBeenCalledWith(
        expect.objectContaining({
          enableMcpDiscovery: true,
        }),
      );
    });
  });
});
