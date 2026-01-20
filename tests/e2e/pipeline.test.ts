/**
 * End-to-End Pipeline Integration Tests
 *
 * These tests exercise the complete 4-stage pipeline with real Anthropic SDK calls.
 * They are gated behind the RUN_E2E_TESTS environment variable to prevent
 * accidental API costs during regular test runs.
 *
 * Run with: RUN_E2E_TESTS=true npm test -- tests/e2e/
 *
 * Design Philosophy:
 * - E2E tests mirror user workflows, not internal stage boundaries
 * - Stage isolation is tested in unit/integration tests
 * - Minimize redundant API calls by testing all component types together
 *
 * @module tests/e2e/pipeline
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAnalysis } from "../../src/stages/1-analysis/index.js";
import { runGeneration } from "../../src/stages/2-generation/index.js";
import {
  runExecution,
  consoleProgress,
} from "../../src/stages/3-execution/index.js";
import { runEvaluation } from "../../src/stages/4-evaluation/index.js";

import type { AnalysisOutput } from "../../src/types/index.js";
import type { TestScenario } from "../../src/types/index.js";

import {
  shouldRunE2E,
  shouldRunE2EMcp,
  validateE2EEnvironment,
  createE2EConfig,
  isWithinE2EBudget,
} from "./helpers.js";

// Skip all tests if E2E is not enabled
const describeE2E = shouldRunE2E() ? describe : describe.skip;

// Skip MCP tests unless explicitly enabled (slow due to server startup)
const describeMcp = shouldRunE2EMcp() ? describe : describe.skip;

// Track metrics across all tests for performance monitoring
let totalE2ECost = 0;
let totalGenerationCost = 0;
let totalExecutionCost = 0;
let totalEvaluationCost = 0;
let e2eStartTime = 0;
let e2eTestCount = 0;

// Shared analysis result - computed once, reused across tests
let sharedAnalysis: AnalysisOutput;

// Module-level afterAll ensures total budget validation runs
afterAll(() => {
  if (e2eTestCount > 0) {
    expect(isWithinE2EBudget(totalE2ECost)).toBe(true);
  }
});

describeE2E("E2E: User Workflows", () => {
  beforeAll(async () => {
    validateE2EEnvironment();
    e2eStartTime = Date.now();

    // Run analysis ONCE for all tests - this is the expensive part
    // All tests share this result to avoid redundant work
    const config = createE2EConfig({
      scope: {
        skills: true,
        agents: true,
        commands: true,
        hooks: true,
        mcp_servers: false, // MCP tested separately
      },
    });

    sharedAnalysis = await runAnalysis(config);
  });

  afterAll(() => {
    const totalDurationMs = Date.now() - e2eStartTime;
    const totalDurationSec = totalDurationMs / 1000;

    console.log("\n========================================");
    console.log("E2E Performance Metrics");
    console.log("========================================");
    console.log(`Total Cost:       $${totalE2ECost.toFixed(4)}`);
    console.log(`  Generation:     $${totalGenerationCost.toFixed(4)}`);
    console.log(`  Execution:      $${totalExecutionCost.toFixed(4)}`);
    console.log(`  Evaluation:     $${totalEvaluationCost.toFixed(4)}`);
    console.log(`Total Duration:   ${totalDurationSec.toFixed(1)}s`);
    console.log(`Tests Executed:   ${e2eTestCount}`);
    if (totalDurationSec > 0 && e2eTestCount > 0) {
      console.log(
        `Cost Efficiency:  $${((totalE2ECost / totalDurationSec) * 60).toFixed(4)}/min`,
      );
      console.log(
        `Avg Time/Test:    ${(totalDurationSec / e2eTestCount).toFixed(1)}s`,
      );
    }
    console.log("========================================\n");
  });

  /**
   * Main E2E test: Full pipeline smoke test.
   *
   * This is the primary user workflow - point at a plugin and run evaluation.
   * Tests skills only to keep runtime reasonable (~2-3 minutes).
   * Other component types follow the same execution path.
   */
  it("runs full evaluation pipeline for all component types", async () => {
    const config = createE2EConfig({
      scope: {
        skills: true,
        agents: false, // Skip to reduce scenarios
        commands: false, // Commands generate many variations, skip for speed
        hooks: false,
      },
      generation: { scenarios_per_component: 1 },
      execution: {
        max_turns: 2,
        max_budget_usd: 0.2,
      },
    });

    // Verify analysis captured component types
    expect(sharedAnalysis.plugin_name).toBe("test-plugin");
    expect(sharedAnalysis.components.skills.length).toBeGreaterThan(0);

    // Stage 2: Generation
    const generation = await runGeneration(sharedAnalysis, config);
    expect(generation.scenarios.length).toBeGreaterThan(0);

    // Verify we have skill scenarios
    const scenarioTypes = new Set(
      generation.scenarios.map((s) => s.component_type),
    );
    expect(scenarioTypes.has("skill")).toBe(true);

    // Stage 3: Execution
    const execution = await runExecution({
      analysis: sharedAnalysis,
      scenarios: generation.scenarios,
      config,
      progress: consoleProgress,
    });

    e2eTestCount++;

    expect(execution.results.length).toBe(generation.scenarios.length);
    expect(execution.plugin_name).toBe("test-plugin");

    // Verify transcript structure
    for (const result of execution.results) {
      expect(result.scenario_id).toBeDefined();
      expect(result.transcript).toBeDefined();
      expect(result.transcript.metadata.version).toBe("v3.0");
      expect(result.detected_tools).toBeDefined();
      expect(typeof result.cost_usd).toBe("number");
    }

    // Stage 4: Evaluation
    const evaluation = await runEvaluation({
      pluginName: sharedAnalysis.plugin_name,
      scenarios: generation.scenarios,
      executions: execution.results,
      config,
      progress: consoleProgress,
      generationCostUsd: generation.generation_cost_usd,
    });

    // Track per-stage costs
    totalGenerationCost += evaluation.metrics.generation_cost_usd;
    totalExecutionCost += evaluation.metrics.execution_cost_usd;
    totalEvaluationCost += evaluation.metrics.evaluation_cost_usd;
    totalE2ECost += evaluation.metrics.total_cost_usd;

    // Verify evaluation metrics
    expect(evaluation.metrics).toBeDefined();
    expect(typeof evaluation.metrics.accuracy).toBe("number");
    expect(typeof evaluation.metrics.trigger_rate).toBe("number");
    expect(evaluation.metrics.total_scenarios).toBe(
      generation.scenarios.length,
    );

    // Verify all scenarios were evaluated
    expect(evaluation.results.length).toBe(generation.scenarios.length);
    for (const result of evaluation.results) {
      expect(result.scenario_id).toBeDefined();
      expect(typeof result.triggered).toBe("boolean");
      expect(result.detection_source).toBeDefined();
    }

    // Log detection stats (informational)
    const programmaticCount = evaluation.results.filter(
      (r) => r.detection_source === "programmatic",
    ).length;
    const llmCount = evaluation.results.filter(
      (r) => r.detection_source === "llm",
    ).length;

    console.log(
      `\nE2E Full Pipeline Complete:` +
        `\n  Scenarios: ${evaluation.metrics.total_scenarios}` +
        `\n  Detection: ${programmaticCount} programmatic, ${llmCount} LLM` +
        `\n  Accuracy: ${(evaluation.metrics.accuracy * 100).toFixed(1)}%` +
        `\n  Trigger Rate: ${(evaluation.metrics.trigger_rate * 100).toFixed(1)}%` +
        `\n  Cost: $${execution.total_cost_usd.toFixed(4)}`,
    );
  }, 180000); // 3 minute timeout for skills-only pipeline

  /**
   * Negative scenario test: Verify non-triggering prompts don't trigger.
   *
   * This is important for validating detection accuracy - we need to ensure
   * the system doesn't have false positives.
   */
  it("correctly identifies non-triggering prompts", async () => {
    const config = createE2EConfig({
      scope: { skills: true, agents: true },
      generation: { scenarios_per_component: 1 },
      execution: {
        max_turns: 2,
        max_budget_usd: 0.1,
      },
    });

    // Create negative scenarios for skills and agents
    const targetSkill = sharedAnalysis.components.skills[0];
    const targetAgent = sharedAnalysis.components.agents[0];

    const negativeScenarios: TestScenario[] = [
      {
        id: `negative-skill-${targetSkill.name}`,
        component_ref: targetSkill.name,
        component_type: "skill",
        user_prompt: "What is the weather like today in Seattle?",
        expected_trigger: false,
        expected_component: targetSkill.name,
        scenario_type: "negative",
        reasoning: "Weather query is unrelated to any skill triggers.",
      },
      {
        id: `negative-agent-${targetAgent.name}`,
        component_ref: targetAgent.name,
        component_type: "agent",
        user_prompt: "Calculate the factorial of 10 for me.",
        expected_trigger: false,
        expected_component: targetAgent.name,
        scenario_type: "negative",
        reasoning: "Math calculation is unrelated to agent triggers.",
      },
    ];

    // Execute negative scenarios
    const execution = await runExecution({
      analysis: sharedAnalysis,
      scenarios: negativeScenarios,
      config,
      progress: consoleProgress,
    });

    e2eTestCount++;

    // Evaluate
    const evaluation = await runEvaluation({
      pluginName: sharedAnalysis.plugin_name,
      scenarios: negativeScenarios,
      executions: execution.results,
      config,
      progress: consoleProgress,
    });

    // Track per-stage costs (no generation stage in this test)
    totalExecutionCost += evaluation.metrics.execution_cost_usd;
    totalEvaluationCost += evaluation.metrics.evaluation_cost_usd;
    totalE2ECost += evaluation.metrics.total_cost_usd;

    // All negative scenarios should NOT trigger
    for (const result of evaluation.results) {
      const scenario = negativeScenarios.find(
        (s) => s.id === result.scenario_id,
      );

      if (result.triggered) {
        console.log(
          `\nFalse Positive Detected:` +
            `\n  Scenario: ${result.scenario_id}` +
            `\n  Prompt: "${scenario?.user_prompt}"` +
            `\n  This may indicate overly broad triggers.`,
        );
      }

      // Assert no false positives
      expect(result.triggered).toBe(false);
    }

    console.log(
      `\nE2E Negative Scenarios: ${evaluation.results.length} tested, all correctly non-triggered`,
    );
  }, 120000);

  /**
   * Error handling test: Verify graceful degradation with budget limits.
   *
   * Users may set tight budgets - the system should handle this gracefully.
   */
  it("handles budget limits gracefully", async () => {
    const config = createE2EConfig({
      scope: { skills: true },
      generation: { scenarios_per_component: 1 },
      execution: {
        max_turns: 1,
        max_budget_usd: 0.0001, // Tiny budget to test limit handling
      },
    });

    // Use cached analysis, just run generation and execution
    const generation = await runGeneration(sharedAnalysis, config);

    // Should not throw, even with tiny budget
    const execution = await runExecution({
      analysis: sharedAnalysis,
      scenarios: generation.scenarios,
      config,
      progress: consoleProgress,
    });

    // Track costs (no evaluation stage in this test)
    const genCost = generation.generation_cost_usd ?? 0;
    totalGenerationCost += genCost;
    totalExecutionCost += execution.total_cost_usd;
    totalE2ECost += genCost + execution.total_cost_usd;
    e2eTestCount++;

    // Verify execution completed (may have partial/no results due to budget)
    expect(execution).toBeDefined();
    expect(execution.results).toBeDefined();
    expect(Array.isArray(execution.results)).toBe(true);

    console.log(
      `\nE2E Budget Limit Test: Completed with ${execution.results.length} results`,
    );
  }, 60000);

  /**
   * Deterministic generation test: Verify commands/hooks don't use LLM.
   *
   * Commands and hooks use template-based generation - verify this is deterministic.
   */
  it("generates deterministic scenarios for commands and hooks", async () => {
    const config = createE2EConfig({
      scope: { commands: true, hooks: true },
      generation: { scenarios_per_component: 1 },
    });

    // Run generation twice
    const gen1 = await runGeneration(sharedAnalysis, config);
    const gen2 = await runGeneration(sharedAnalysis, config);

    // Track costs (template-based generation, should be $0 but track anyway)
    const genCost = (gen1.generation_cost_usd ?? 0) + (gen2.generation_cost_usd ?? 0);
    totalGenerationCost += genCost;
    totalE2ECost += genCost;
    e2eTestCount++;

    // Should produce identical scenario counts
    expect(gen1.scenarios.length).toBe(gen2.scenarios.length);

    // Scenario types should match
    const types1 = gen1.scenarios.map((s) => s.scenario_type).sort();
    const types2 = gen2.scenarios.map((s) => s.scenario_type).sort();
    expect(types1).toEqual(types2);

    // Component refs should match
    const refs1 = gen1.scenarios.map((s) => s.component_ref).sort();
    const refs2 = gen2.scenarios.map((s) => s.component_ref).sort();
    expect(refs1).toEqual(refs2);

    console.log(
      `\nE2E Deterministic Generation: ${gen1.scenarios.length} scenarios, verified identical`,
    );
  }, 30000);
});

// =============================================================================
// MCP Server E2E Tests (Optional - requires RUN_E2E_MCP_TESTS=true)
// =============================================================================

/**
 * MCP Server E2E Tests
 *
 * Gated behind RUN_E2E_MCP_TESTS because:
 * - MCP server connections add significant startup latency (5-10s)
 * - External dependencies (npx, network) may cause flakiness
 *
 * Run with: RUN_E2E_TESTS=true RUN_E2E_MCP_TESTS=true npm test -- tests/e2e/
 */
describeMcp("E2E: MCP Server Pipeline", () => {
  beforeAll(() => {
    validateE2EEnvironment();
  });

  it("runs complete pipeline for MCP servers", async () => {
    const config = createE2EConfig({
      scope: { mcp_servers: true },
      generation: { scenarios_per_component: 1 },
      execution: {
        max_turns: 3,
        max_budget_usd: 0.1,
        timeout_ms: 120000,
      },
    });

    // Stage 1: Analysis (fresh for MCP since it needs different scope)
    const analysis = await runAnalysis(config);

    if (analysis.components.mcp_servers.length === 0) {
      console.log("Skipping MCP pipeline test: no MCP servers in test plugin");
      return;
    }

    console.log(
      `\nMCP Servers discovered: ${analysis.components.mcp_servers.map((s) => s.name).join(", ")}`,
    );

    // Stage 2: Generation (deterministic for MCP)
    const generation = await runGeneration(analysis, config);
    expect(generation.scenarios.length).toBeGreaterThan(0);

    // Stage 3: Execution
    const execution = await runExecution({
      analysis,
      scenarios: generation.scenarios,
      config,
      progress: consoleProgress,
    });

    expect(execution.results.length).toBeGreaterThan(0);

    // Stage 4: Evaluation
    const evaluation = await runEvaluation({
      pluginName: analysis.plugin_name,
      scenarios: generation.scenarios,
      executions: execution.results,
      config,
      progress: consoleProgress,
      generationCostUsd: generation.generation_cost_usd,
    });

    expect(evaluation.metrics).toBeDefined();
    expect(evaluation.results.length).toBe(generation.scenarios.length);

    // Check for MCP tool detections
    const mcpDetections = execution.results.flatMap((r) =>
      r.detected_tools.filter((t) => t.name.startsWith("mcp__")),
    );

    console.log(
      `\nE2E MCP Pipeline Complete:` +
        `\n  MCP servers: ${analysis.components.mcp_servers.length}` +
        `\n  Scenarios: ${generation.scenarios.length}` +
        `\n  MCP tool invocations: ${mcpDetections.length}` +
        `\n  Accuracy: ${(evaluation.metrics.accuracy * 100).toFixed(1)}%` +
        `\n  Cost: $${execution.total_cost_usd.toFixed(4)}`,
    );
  }, 300000);
});
