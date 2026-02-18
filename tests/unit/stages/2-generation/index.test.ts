/**
 * Tests for Stage 2 generation orchestration.
 *
 * Tests the main runGeneration function and its integration with
 * cost estimation, LLM generation, and deterministic generators.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import type {
  AnalysisOutput,
  EvalConfig,
  TestScenario,
} from "../../../../src/types/index.js";

import { logger } from "../../../../src/utils/logging.js";

import {
  estimatePipelineCost,
  formatPipelineCostEstimate,
} from "../../../../src/stages/2-generation/cost-estimator.js";
import { createLLMProvider } from "../../../../src/providers/index.js";
import type { LLMProvider } from "../../../../src/providers/types.js";
import { generateAllSkillScenarios } from "../../../../src/stages/2-generation/skill-scenario-generator.js";
import { generateAllAgentScenarios } from "../../../../src/stages/2-generation/agent-scenario-generator.js";
import { generateAllCommandScenarios } from "../../../../src/stages/2-generation/command-scenario-generator.js";
import { generateAllHookScenarios } from "../../../../src/stages/2-generation/hook-scenario-generator.js";
import { generateAllMcpScenarios } from "../../../../src/stages/2-generation/mcp-scenario-generator.js";
import { calculateDiversityMetrics } from "../../../../src/stages/2-generation/diversity-manager.js";

import { runGeneration } from "../../../../src/stages/2-generation/index.js";

// Mock dependencies
vi.mock("../../../../src/utils/logging.js", () => ({
  logger: {
    stageHeader: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    progress: vi.fn(),
  },
}));

vi.mock("../../../../src/stages/2-generation/cost-estimator.js", () => ({
  estimatePipelineCost: vi.fn(),
  formatPipelineCostEstimate: vi.fn(() => "Cost estimate: $0.10"),
}));

vi.mock("../../../../src/providers/index.js", () => ({
  createLLMProvider: vi.fn(),
}));

vi.mock(
  "../../../../src/stages/2-generation/skill-scenario-generator.js",
  () => ({
    generateAllSkillScenarios: vi.fn(),
    createFallbackSkillScenarios: vi.fn(() => []),
  }),
);

vi.mock(
  "../../../../src/stages/2-generation/agent-scenario-generator.js",
  () => ({
    generateAllAgentScenarios: vi.fn(),
    createFallbackAgentScenarios: vi.fn(() => []),
  }),
);

vi.mock(
  "../../../../src/stages/2-generation/command-scenario-generator.js",
  () => ({
    generateAllCommandScenarios: vi.fn(() => []),
  }),
);

vi.mock(
  "../../../../src/stages/2-generation/hook-scenario-generator.js",
  () => ({
    generateAllHookScenarios: vi.fn(() => []),
  }),
);

vi.mock(
  "../../../../src/stages/2-generation/mcp-scenario-generator.js",
  () => ({
    generateAllMcpScenarios: vi.fn(() => []),
  }),
);

vi.mock("../../../../src/stages/2-generation/diversity-manager.js", () => ({
  calculateDiversityMetrics: vi.fn(() => ({
    by_type: {
      direct: 1,
      paraphrased: 0,
      edge_case: 0,
      negative: 0,
      proactive: 0,
      semantic: 0,
    },
    by_component: { "test-skill": 1 },
    base_scenarios: 1,
    variations: 1,
    diversity_ratio: 1.0,
  })),
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

describe("runGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset default mock implementations
    (estimatePipelineCost as Mock).mockReturnValue({
      total_estimated_cost_usd: 0.1,
      within_budget: true,
      stage_estimates: {
        generation: { skill_scenarios: 0.05, agent_scenarios: 0.05 },
        execution: { total: 0 },
        evaluation: { total: 0 },
      },
    });
    const mockProvider: LLMProvider = {
      name: "test",
      supportsStructuredOutput: true,
      supportsPromptCaching: true,
      supportsBatchAPI: false,
      createCompletion: vi.fn(),
      createStructuredCompletion: vi.fn(),
    };
    (createLLMProvider as Mock).mockReturnValue(mockProvider);
    (generateAllSkillScenarios as Mock).mockResolvedValue({
      scenarios: [createScenario()],
      cost_usd: 0.001,
    });
    (generateAllAgentScenarios as Mock).mockResolvedValue({
      scenarios: [],
      cost_usd: 0,
    });
    (generateAllCommandScenarios as Mock).mockReturnValue([]);
    (generateAllHookScenarios as Mock).mockReturnValue([]);
    (generateAllMcpScenarios as Mock).mockReturnValue([]);
  });

  describe("cost estimation", () => {
    it("should estimate costs before generation", async () => {
      const analysis = createAnalysis();
      const config = createConfig();

      await runGeneration(analysis, config);

      expect(estimatePipelineCost).toHaveBeenCalledWith(analysis, config);
      expect(formatPipelineCostEstimate).toHaveBeenCalled();
    });

    it("should warn when exceeding budget", async () => {
      (estimatePipelineCost as Mock).mockReturnValue({
        total_estimated_cost_usd: 100.0,
        within_budget: false,
        stage_estimates: {},
      });

      const analysis = createAnalysis();
      const config = createConfig();

      await runGeneration(analysis, config);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("exceeds budget"),
      );
    });

    it("should not warn when within budget", async () => {
      (estimatePipelineCost as Mock).mockReturnValue({
        total_estimated_cost_usd: 1.0,
        within_budget: true,
        stage_estimates: {},
      });

      const analysis = createAnalysis();
      const config = createConfig();

      await runGeneration(analysis, config);

      // logger.warn should not be called for budget
      const warnCalls = (logger.warn as Mock).mock.calls;
      const budgetWarnings = warnCalls.filter(
        (call) =>
          typeof call[0] === "string" && call[0].includes("exceeds budget"),
      );
      expect(budgetWarnings).toHaveLength(0);
    });
  });

  describe("dry-run mode", () => {
    it("should skip generation and return estimate only", async () => {
      // Note: We use `as never` for component fixtures because tests only need
      // minimal fields to verify orchestration logic. The full component types
      // have many required fields that aren't relevant to these tests.
      // If component interfaces change, TypeScript will catch issues in the
      // actual implementation code, not these orchestration tests.
      const analysis = createAnalysis({
        components: {
          skills: [{ name: "test-skill", path: "/path" } as never],
          agents: [],
          commands: [],
          hooks: [],
          mcp_servers: [],
        },
      });
      const config = createConfig({ dry_run: true });

      const result = await runGeneration(analysis, config);

      expect(result.scenarios).toHaveLength(0);
      expect(generateAllSkillScenarios).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Dry-run mode"),
      );
    });

    it("should return empty scenarios in dry-run", async () => {
      const analysis = createAnalysis();
      const config = createConfig({ dry_run: true });

      const result = await runGeneration(analysis, config);

      expect(result.scenarios).toEqual([]);
      expect(result.scenario_count_by_type).toEqual({
        direct: 0,
        paraphrased: 0,
        edge_case: 0,
        negative: 0,
        proactive: 0,
        semantic: 0,
      });
    });

    it("should include cost estimate in dry-run", async () => {
      const mockEstimate = {
        total_estimated_cost_usd: 5.0,
        within_budget: true,
        stage_estimates: {},
      };
      (estimatePipelineCost as Mock).mockReturnValue(mockEstimate);

      const analysis = createAnalysis();
      const config = createConfig({ dry_run: true });

      const result = await runGeneration(analysis, config);

      expect(result.cost_estimate).toBe(mockEstimate);
    });
  });

  describe("LLM generation", () => {
    it("should generate skill scenarios via LLM", async () => {
      const skillComponent = {
        name: "commit-skill",
        path: "/skills/commit",
        description: "Commit changes",
        triggers: ["commit", "save changes"],
      };
      const analysis = createAnalysis({
        components: {
          skills: [skillComponent as never],
          agents: [],
          commands: [],
          hooks: [],
          mcp_servers: [],
        },
      });
      const config = createConfig({
        scope: { ...createConfig().scope, skills: true },
      });

      const mockScenarios = [
        createScenario({ id: "skill-1", component_ref: "commit-skill" }),
      ];
      (generateAllSkillScenarios as Mock).mockResolvedValue({
        scenarios: mockScenarios,
        cost_usd: 0.001,
      });

      const result = await runGeneration(analysis, config);

      expect(createLLMProvider).toHaveBeenCalled();
      expect(result.scenarios).toContainEqual(
        expect.objectContaining({ id: "skill-1" }),
      );
    });

    it("should generate agent scenarios via LLM", async () => {
      const agentComponent = {
        name: "test-agent",
        path: "/agents/test",
        description: "Test agent",
        triggers: ["use test agent"],
      };
      const analysis = createAnalysis({
        components: {
          skills: [],
          agents: [agentComponent as never],
          commands: [],
          hooks: [],
          mcp_servers: [],
        },
      });
      const config = createConfig({
        scope: { ...createConfig().scope, agents: true },
      });

      const mockScenarios = [
        createScenario({
          id: "agent-1",
          component_type: "agent",
          component_ref: "test-agent",
        }),
      ];
      (generateAllAgentScenarios as Mock).mockResolvedValue({
        scenarios: mockScenarios,
        cost_usd: 0.001,
      });

      const result = await runGeneration(analysis, config);

      expect(result.scenarios).toContainEqual(
        expect.objectContaining({ id: "agent-1" }),
      );
    });

    it("should skip skills when scope.skills is false", async () => {
      const analysis = createAnalysis({
        components: {
          skills: [{ name: "skill" } as never],
          agents: [],
          commands: [],
          hooks: [],
          mcp_servers: [],
        },
      });
      const config = createConfig({
        scope: {
          skills: false,
          agents: false,
          commands: false,
          hooks: false,
          mcp_servers: false,
        },
      });

      await runGeneration(analysis, config);

      expect(generateAllSkillScenarios).not.toHaveBeenCalled();
    });

    it("should skip agents when scope.agents is false", async () => {
      const analysis = createAnalysis({
        components: {
          skills: [],
          agents: [{ name: "agent" } as never],
          commands: [],
          hooks: [],
          mcp_servers: [],
        },
      });
      const config = createConfig({
        scope: {
          skills: false,
          agents: false,
          commands: false,
          hooks: false,
          mcp_servers: false,
        },
      });

      await runGeneration(analysis, config);

      expect(generateAllAgentScenarios).not.toHaveBeenCalled();
    });
  });

  describe("deterministic generation", () => {
    it("should generate command scenarios deterministically", async () => {
      const commandComponent = {
        name: "build",
        path: "/commands/build.md",
        description: "Build the project",
      };
      const analysis = createAnalysis({
        components: {
          skills: [],
          agents: [],
          commands: [commandComponent as never],
          hooks: [],
          mcp_servers: [],
        },
      });
      const config = createConfig({
        scope: { ...createConfig().scope, commands: true },
      });

      const mockScenarios = [
        createScenario({
          id: "cmd-1",
          component_type: "command",
          component_ref: "build",
        }),
      ];
      (generateAllCommandScenarios as Mock).mockReturnValue(mockScenarios);

      const result = await runGeneration(analysis, config);

      expect(generateAllCommandScenarios).toHaveBeenCalledWith(
        analysis.components.commands,
      );
      // Command scenarios don't require LLM
      expect(result.scenarios).toContainEqual(
        expect.objectContaining({ id: "cmd-1" }),
      );
    });

    it("should generate hook scenarios deterministically", async () => {
      const hookComponent = {
        name: "PreToolUse::Write",
        event: "PreToolUse",
        matcher: "Write",
      };
      const analysis = createAnalysis({
        components: {
          skills: [],
          agents: [],
          commands: [],
          hooks: [hookComponent as never],
          mcp_servers: [],
        },
      });
      const config = createConfig({
        scope: { ...createConfig().scope, hooks: true },
      });

      const mockScenarios = [
        createScenario({
          id: "hook-1",
          component_type: "hook",
          component_ref: "PreToolUse::Write",
        }),
      ];
      (generateAllHookScenarios as Mock).mockReturnValue(mockScenarios);

      const result = await runGeneration(analysis, config);

      expect(generateAllHookScenarios).toHaveBeenCalledWith(
        analysis.components.hooks,
      );
      expect(result.scenarios).toContainEqual(
        expect.objectContaining({ id: "hook-1" }),
      );
    });

    it("should generate MCP scenarios deterministically", async () => {
      const mcpComponent = {
        name: "postgres-mcp",
        tools: ["query", "insert"],
      };
      const analysis = createAnalysis({
        components: {
          skills: [],
          agents: [],
          commands: [],
          hooks: [],
          mcp_servers: [mcpComponent as never],
        },
      });
      const config = createConfig({
        scope: { ...createConfig().scope, mcp_servers: true },
      });

      const mockScenarios = [
        createScenario({
          id: "mcp-1",
          component_type: "mcp_server",
          component_ref: "postgres-mcp",
        }),
      ];
      (generateAllMcpScenarios as Mock).mockReturnValue(mockScenarios);

      const result = await runGeneration(analysis, config);

      expect(generateAllMcpScenarios).toHaveBeenCalledWith(
        analysis.components.mcp_servers,
      );
      expect(result.scenarios).toContainEqual(
        expect.objectContaining({ id: "mcp-1" }),
      );
    });
  });

  describe("progress callbacks", () => {
    it("should call onProgress for each component type", async () => {
      const analysis = createAnalysis({
        components: {
          skills: [{ name: "skill" } as never],
          agents: [],
          commands: [{ name: "cmd" } as never],
          hooks: [],
          mcp_servers: [],
        },
      });
      const config = createConfig({
        scope: {
          skills: true,
          agents: false,
          commands: true,
          hooks: false,
          mcp_servers: false,
        },
      });
      const onProgress = vi.fn();

      await runGeneration(analysis, config, { onProgress });

      // Commands should trigger progress callback
      expect(onProgress).toHaveBeenCalledWith("commands", 1, 1);
    });

    it("should call progress for hooks when enabled", async () => {
      const analysis = createAnalysis({
        components: {
          skills: [],
          agents: [],
          commands: [],
          hooks: [{ name: "hook" } as never],
          mcp_servers: [],
        },
      });
      const config = createConfig({
        scope: {
          skills: false,
          agents: false,
          commands: false,
          hooks: true,
          mcp_servers: false,
        },
      });
      const onProgress = vi.fn();

      await runGeneration(analysis, config, { onProgress });

      expect(onProgress).toHaveBeenCalledWith("hooks", 1, 1);
    });

    it("should call progress for MCP servers when enabled", async () => {
      const analysis = createAnalysis({
        components: {
          skills: [],
          agents: [],
          commands: [],
          hooks: [],
          mcp_servers: [{ name: "mcp" } as never],
        },
      });
      const config = createConfig({
        scope: {
          skills: false,
          agents: false,
          commands: false,
          hooks: false,
          mcp_servers: true,
        },
      });
      const onProgress = vi.fn();

      await runGeneration(analysis, config, { onProgress });

      expect(onProgress).toHaveBeenCalledWith("mcp_servers", 1, 1);
    });
  });

  describe("diversity metrics", () => {
    it("should calculate and return diversity metrics", async () => {
      const analysis = createAnalysis();
      const config = createConfig();

      const result = await runGeneration(analysis, config);

      expect(calculateDiversityMetrics).toHaveBeenCalled();
      expect(result.diversity_metrics).toEqual({
        base_scenarios: 1,
        total_with_variations: 1,
        diversity_ratio: 1.0,
      });
    });
  });

  describe("output structure", () => {
    it("should return correct output structure", async () => {
      const analysis = createAnalysis();
      const config = createConfig();

      const result = await runGeneration(analysis, config);

      expect(result).toHaveProperty("plugin_name", "test-plugin");
      expect(result).toHaveProperty("scenarios");
      expect(result).toHaveProperty("scenario_count_by_type");
      expect(result).toHaveProperty("scenario_count_by_component");
      expect(result).toHaveProperty("cost_estimate");
      expect(result).toHaveProperty("diversity_metrics");
    });

    it("should aggregate scenarios from all generators", async () => {
      const analysis = createAnalysis({
        components: {
          skills: [{ name: "skill" } as never],
          agents: [],
          commands: [{ name: "cmd" } as never],
          hooks: [],
          mcp_servers: [],
        },
      });
      const config = createConfig({
        scope: {
          skills: true,
          agents: false,
          commands: true,
          hooks: false,
          mcp_servers: false,
        },
      });

      (generateAllSkillScenarios as Mock).mockResolvedValue({
        scenarios: [createScenario({ id: "skill-1" })],
        cost_usd: 0.001,
      });
      (generateAllCommandScenarios as Mock).mockReturnValue([
        createScenario({ id: "cmd-1", component_type: "command" }),
      ]);

      const result = await runGeneration(analysis, config);

      expect(result.scenarios).toHaveLength(2);
      expect(result.scenarios.map((s) => s.id)).toContain("skill-1");
      expect(result.scenarios.map((s) => s.id)).toContain("cmd-1");
    });
  });

  describe("empty components", () => {
    it("should skip generation when skill array is empty", async () => {
      const analysis = createAnalysis({
        components: {
          skills: [],
          agents: [],
          commands: [],
          hooks: [],
          mcp_servers: [],
        },
      });
      const config = createConfig({
        scope: {
          skills: true,
          agents: false,
          commands: false,
          hooks: false,
          mcp_servers: false,
        },
      });

      const result = await runGeneration(analysis, config);

      // When skills array is empty, generateAllSkillScenarios should not be called
      // even if scope.skills is true
      expect(generateAllSkillScenarios).not.toHaveBeenCalled();
      expect(result.scenarios).toHaveLength(0);
    });

    it("should handle all empty components with scope disabled", async () => {
      const analysis = createAnalysis();
      const config = createConfig({
        scope: {
          skills: false,
          agents: false,
          commands: false,
          hooks: false,
          mcp_servers: false,
        },
      });

      const result = await runGeneration(analysis, config);

      expect(result.scenarios).toHaveLength(0);
    });
  });
});
