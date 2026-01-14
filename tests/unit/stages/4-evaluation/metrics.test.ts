/**
 * Tests for metrics functions.
 */

import { describe, it, expect } from "vitest";

import type {
  EvaluationResult,
  ExecutionResult,
  TestScenario,
} from "../../../../src/types/index.js";

import {
  calculateTriggerRate,
  calculateAccuracy,
  calculateAvgQuality,
  countFalsePositives,
  countFalseNegatives,
  calculateComponentMetrics,
  calculateMultiSampleStats,
  calculateEvalMetrics,
  formatMetrics,
  createEmptyMetrics,
} from "../../../../src/stages/4-evaluation/metrics.js";

/**
 * Create a mock EvaluationResult.
 */
function createEvalResult(
  overrides: Partial<EvaluationResult> = {},
): EvaluationResult {
  return {
    scenario_id: "test-1",
    triggered: true,
    confidence: 100,
    quality_score: 8,
    evidence: [],
    issues: [],
    summary: "test",
    detection_source: "programmatic",
    all_triggered_components: [],
    has_conflict: false,
    conflict_severity: "none",
    ...overrides,
  };
}

/**
 * Create a mock TestScenario.
 */
function createScenario(overrides: Partial<TestScenario> = {}): TestScenario {
  return {
    id: "test-1",
    component_ref: "test-skill",
    component_type: "skill",
    scenario_type: "direct",
    user_prompt: "test",
    expected_trigger: true,
    expected_component: "test-skill",
    ...overrides,
  };
}

/**
 * Create a mock ExecutionResult.
 */
function createExecResult(
  overrides: Partial<ExecutionResult> = {},
): ExecutionResult {
  return {
    scenario_id: "test-1",
    transcript: {
      metadata: {
        version: "v3.0",
        plugin_name: "test",
        scenario_id: "test-1",
        timestamp: new Date().toISOString(),
        model: "test",
      },
      events: [],
    },
    detected_tools: [],
    cost_usd: 0.01,
    api_duration_ms: 1000,
    num_turns: 1,
    permission_denials: [],
    errors: [],
    ...overrides,
  };
}

describe("calculateTriggerRate", () => {
  it("should calculate percentage of triggered results", () => {
    const results = [
      createEvalResult({ triggered: true }),
      createEvalResult({ triggered: true }),
      createEvalResult({ triggered: false }),
    ];

    expect(calculateTriggerRate(results)).toBeCloseTo(2 / 3);
  });

  it("should return 0 for empty array", () => {
    expect(calculateTriggerRate([])).toBe(0);
  });

  it("should return 1 when all triggered", () => {
    const results = [
      createEvalResult({ triggered: true }),
      createEvalResult({ triggered: true }),
    ];

    expect(calculateTriggerRate(results)).toBe(1);
  });

  it("should return 0 when none triggered", () => {
    const results = [
      createEvalResult({ triggered: false }),
      createEvalResult({ triggered: false }),
    ];

    expect(calculateTriggerRate(results)).toBe(0);
  });
});

describe("calculateAccuracy", () => {
  it("should count correct triggers as accurate", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
    ];

    expect(calculateAccuracy(results)).toBe(1);
  });

  it("should count correct non-triggers as accurate", () => {
    const results = [
      {
        result: createEvalResult({ triggered: false }),
        scenario: createScenario({ expected_trigger: false }),
        execution: createExecResult(),
      },
    ];

    expect(calculateAccuracy(results)).toBe(1);
  });

  it("should count mismatches as inaccurate", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: false }),
        execution: createExecResult(),
      },
      {
        result: createEvalResult({ triggered: false }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
    ];

    expect(calculateAccuracy(results)).toBe(0);
  });

  it("should calculate mixed accuracy", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
      {
        result: createEvalResult({ triggered: false }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
    ];

    expect(calculateAccuracy(results)).toBe(0.5);
  });

  it("should return 0 for empty array", () => {
    expect(calculateAccuracy([])).toBe(0);
  });
});

describe("calculateAvgQuality", () => {
  it("should average quality scores", () => {
    const results = [
      createEvalResult({ quality_score: 7 }),
      createEvalResult({ quality_score: 8 }),
      createEvalResult({ quality_score: 9 }),
    ];

    expect(calculateAvgQuality(results)).toBe(8);
  });

  it("should exclude null quality scores", () => {
    const results = [
      createEvalResult({ quality_score: 8 }),
      createEvalResult({ quality_score: null }),
      createEvalResult({ quality_score: 10 }),
    ];

    expect(calculateAvgQuality(results)).toBe(9);
  });

  it("should exclude zero quality scores", () => {
    const results = [
      createEvalResult({ quality_score: 8 }),
      createEvalResult({ quality_score: 0 }),
    ];

    expect(calculateAvgQuality(results)).toBe(8);
  });

  it("should return 0 when no valid scores", () => {
    const results = [
      createEvalResult({ quality_score: null }),
      createEvalResult({ quality_score: 0 }),
    ];

    expect(calculateAvgQuality(results)).toBe(0);
  });

  it("should return 0 for empty array", () => {
    expect(calculateAvgQuality([])).toBe(0);
  });
});

describe("countFalsePositives", () => {
  it("should count triggered when not expected", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: false }),
        execution: createExecResult(),
      },
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
    ];

    expect(countFalsePositives(results)).toBe(1);
  });

  it("should return 0 when no false positives", () => {
    const results = [
      {
        result: createEvalResult({ triggered: false }),
        scenario: createScenario({ expected_trigger: false }),
        execution: createExecResult(),
      },
    ];

    expect(countFalsePositives(results)).toBe(0);
  });
});

describe("countFalseNegatives", () => {
  it("should count not triggered when expected", () => {
    const results = [
      {
        result: createEvalResult({ triggered: false }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
    ];

    expect(countFalseNegatives(results)).toBe(1);
  });

  it("should return 0 when no false negatives", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
    ];

    expect(countFalseNegatives(results)).toBe(0);
  });
});

describe("calculateComponentMetrics", () => {
  it("should group metrics by component", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true, quality_score: 8 }),
        scenario: createScenario({ expected_component: "skill-a" }),
        execution: createExecResult(),
      },
      {
        result: createEvalResult({ triggered: true, quality_score: 9 }),
        scenario: createScenario({ expected_component: "skill-a" }),
        execution: createExecResult(),
      },
      {
        result: createEvalResult({ triggered: false, quality_score: null }),
        scenario: createScenario({ expected_component: "skill-b" }),
        execution: createExecResult(),
      },
    ];

    const metrics = calculateComponentMetrics(results);

    expect(metrics["skill-a"]).toBeDefined();
    expect(metrics["skill-a"]?.scenarios_count).toBe(2);
    expect(metrics["skill-a"]?.trigger_rate).toBe(1);
    expect(metrics["skill-a"]?.avg_quality).toBe(8.5);

    expect(metrics["skill-b"]).toBeDefined();
    expect(metrics["skill-b"]?.scenarios_count).toBe(1);
    expect(metrics["skill-b"]?.trigger_rate).toBe(0);
  });
});

describe("calculateMultiSampleStats", () => {
  it("should return undefined for empty sampleData", () => {
    expect(calculateMultiSampleStats([])).toBeUndefined();
  });

  it("should return undefined when num_samples is 1", () => {
    const sampleData = [
      { scenarioId: "s1", variance: 0, numSamples: 1, hasConsensus: true },
    ];
    expect(calculateMultiSampleStats(sampleData)).toBeUndefined();
  });

  it("should calculate consensus_rate from hasConsensus field", () => {
    const sampleData = [
      { scenarioId: "s1", variance: 0.5, numSamples: 3, hasConsensus: true },
      { scenarioId: "s2", variance: 0.3, numSamples: 3, hasConsensus: true },
      { scenarioId: "s3", variance: 0.8, numSamples: 3, hasConsensus: false },
      { scenarioId: "s4", variance: 0.2, numSamples: 3, hasConsensus: true },
    ];

    const stats = calculateMultiSampleStats(sampleData);

    expect(stats).toBeDefined();
    // 3 out of 4 have consensus
    expect(stats?.consensus_rate).toBe(0.75);
  });

  it("should track high variance scenarios independently of consensus", () => {
    const sampleData = [
      // Low variance, has consensus
      { scenarioId: "s1", variance: 0.5, numSamples: 3, hasConsensus: true },
      // High variance (> 1.0), has consensus - this is the key test case
      // Low quality score variance but unanimous trigger_accuracy
      { scenarioId: "s2", variance: 1.5, numSamples: 3, hasConsensus: true },
      // Low variance, no consensus - another key test case
      // Similar quality scores but disagreement on trigger_accuracy
      { scenarioId: "s3", variance: 0.3, numSamples: 3, hasConsensus: false },
    ];

    const stats = calculateMultiSampleStats(sampleData);

    expect(stats).toBeDefined();
    // High variance only for s2
    expect(stats?.high_variance_scenarios).toEqual(["s2"]);
    // Consensus for s1 and s2 (2 out of 3)
    expect(stats?.consensus_rate).toBeCloseTo(2 / 3);
  });

  it("should calculate average variance correctly", () => {
    const sampleData = [
      { scenarioId: "s1", variance: 1.0, numSamples: 3, hasConsensus: true },
      { scenarioId: "s2", variance: 2.0, numSamples: 3, hasConsensus: true },
      { scenarioId: "s3", variance: 3.0, numSamples: 3, hasConsensus: false },
    ];

    const stats = calculateMultiSampleStats(sampleData);

    expect(stats?.avg_score_variance).toBe(2.0);
  });

  it("should return 100% consensus rate when all scenarios are unanimous", () => {
    const sampleData = [
      { scenarioId: "s1", variance: 0.5, numSamples: 3, hasConsensus: true },
      { scenarioId: "s2", variance: 0.3, numSamples: 3, hasConsensus: true },
    ];

    const stats = calculateMultiSampleStats(sampleData);

    expect(stats?.consensus_rate).toBe(1.0);
  });

  it("should return 0% consensus rate when no scenarios are unanimous", () => {
    const sampleData = [
      { scenarioId: "s1", variance: 0.5, numSamples: 3, hasConsensus: false },
      { scenarioId: "s2", variance: 0.3, numSamples: 3, hasConsensus: false },
    ];

    const stats = calculateMultiSampleStats(sampleData);

    expect(stats?.consensus_rate).toBe(0);
  });
});

describe("calculateEvalMetrics", () => {
  it("should calculate comprehensive metrics", () => {
    const results = [
      {
        result: createEvalResult({
          triggered: true,
          quality_score: 8,
          has_conflict: false,
        }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult({ cost_usd: 0.01, api_duration_ms: 1000 }),
      },
      {
        result: createEvalResult({
          triggered: false,
          quality_score: null,
          has_conflict: true,
          conflict_severity: "major",
        }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult({ cost_usd: 0.02, api_duration_ms: 2000 }),
      },
    ];

    const executions = results.map((r) => r.execution);

    const metrics = calculateEvalMetrics(results, executions);

    expect(metrics.total_scenarios).toBe(2);
    expect(metrics.triggered_count).toBe(1);
    expect(metrics.trigger_rate).toBe(0.5);
    expect(metrics.accuracy).toBe(0.5);
    expect(metrics.avg_quality).toBe(8);
    expect(metrics.conflict_count).toBe(1);
    expect(metrics.major_conflicts).toBe(1);
    expect(metrics.total_cost_usd).toBe(0.03);
    expect(metrics.total_api_duration_ms).toBe(3000);
  });
});

describe("formatMetrics", () => {
  it("should format metrics as readable string", () => {
    const metrics = createEmptyMetrics();
    metrics.total_scenarios = 10;
    metrics.triggered_count = 8;
    metrics.trigger_rate = 0.8;
    metrics.accuracy = 0.9;
    metrics.avg_quality = 7.5;
    metrics.total_cost_usd = 0.1234;

    const formatted = formatMetrics(metrics);

    expect(formatted).toContain("Evaluation Metrics:");
    expect(formatted).toContain("Total Scenarios:    10");
    expect(formatted).toContain("80.0%");
    expect(formatted).toContain("Accuracy:");
  });

  it("should include error details when present", () => {
    const metrics = createEmptyMetrics();
    metrics.error_count = 3;
    metrics.errors_by_type = {
      api_error: 2,
      timeout: 1,
      permission_denied: 0,
      budget_exceeded: 0,
    };

    const formatted = formatMetrics(metrics);

    expect(formatted).toContain("Errors:             3");
    expect(formatted).toContain("API errors:     2");
    expect(formatted).toContain("Timeouts:       1");
  });
});

describe("createEmptyMetrics", () => {
  it("should create metrics with zero values", () => {
    const metrics = createEmptyMetrics();

    expect(metrics.total_scenarios).toBe(0);
    expect(metrics.triggered_count).toBe(0);
    expect(metrics.trigger_rate).toBe(0);
    expect(metrics.accuracy).toBe(0);
    expect(metrics.avg_quality).toBe(0);
    expect(metrics.conflict_count).toBe(0);
    expect(metrics.total_cost_usd).toBe(0);
    expect(metrics.error_count).toBe(0);
  });

  it("should have empty by_component", () => {
    const metrics = createEmptyMetrics();

    expect(Object.keys(metrics.by_component)).toHaveLength(0);
  });
});

describe("calculateEvalMetrics - repetition_stats", () => {
  it("should include repetition_stats when numReps and flakyScenarios provided", () => {
    const results = [
      {
        result: createEvalResult({ scenario_id: "s1", triggered: true }),
        scenario: createScenario({ id: "s1", expected_trigger: true }),
        execution: createExecResult({ scenario_id: "s1" }),
      },
      {
        result: createEvalResult({ scenario_id: "s2", triggered: false }),
        scenario: createScenario({ id: "s2", expected_trigger: true }),
        execution: createExecResult({ scenario_id: "s2" }),
      },
    ];

    const executions = results.map((r) => r.execution);

    const metrics = calculateEvalMetrics(results, executions, {
      numReps: 3,
      flakyScenarios: ["s2"], // s2 had inconsistent results across reps
    });

    expect(metrics.repetition_stats).toBeDefined();
    expect(metrics.repetition_stats?.reps_per_scenario).toBe(3);
    expect(metrics.repetition_stats?.flaky_scenarios).toEqual(["s2"]);
    // 1 out of 2 scenarios is consistent
    expect(metrics.repetition_stats?.consistency_rate).toBe(0.5);
  });

  it("should not include repetition_stats when numReps is 1", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
    ];

    const metrics = calculateEvalMetrics(
      results,
      results.map((r) => r.execution),
      {
        numReps: 1,
        flakyScenarios: [],
      },
    );

    expect(metrics.repetition_stats).toBeUndefined();
  });

  it("should not include repetition_stats when flakyScenarios not provided", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult(),
      },
    ];

    const metrics = calculateEvalMetrics(
      results,
      results.map((r) => r.execution),
      {
        numReps: 3,
        // flakyScenarios not provided
      },
    );

    expect(metrics.repetition_stats).toBeUndefined();
  });

  it("should calculate 100% consistency when no flaky scenarios", () => {
    const results = [
      {
        result: createEvalResult({ scenario_id: "s1", triggered: true }),
        scenario: createScenario({ id: "s1", expected_trigger: true }),
        execution: createExecResult({ scenario_id: "s1" }),
      },
      {
        result: createEvalResult({ scenario_id: "s2", triggered: true }),
        scenario: createScenario({ id: "s2", expected_trigger: true }),
        execution: createExecResult({ scenario_id: "s2" }),
      },
    ];

    const metrics = calculateEvalMetrics(
      results,
      results.map((r) => r.execution),
      {
        numReps: 5,
        flakyScenarios: [], // No flaky scenarios
      },
    );

    expect(metrics.repetition_stats).toBeDefined();
    expect(metrics.repetition_stats?.consistency_rate).toBe(1);
    expect(metrics.repetition_stats?.flaky_scenarios).toEqual([]);
  });
});

describe("formatMetrics - semantic_stats", () => {
  it("should include semantic stats section when present", () => {
    const metrics = createEmptyMetrics();
    metrics.semantic_stats = {
      total_semantic_scenarios: 10,
      semantic_trigger_rate: 0.85,
      variations_by_type: {
        paraphrase: { count: 5, trigger_rate: 0.8 },
        negative: { count: 5, trigger_rate: 0.9 },
      },
    };

    const formatted = formatMetrics(metrics);

    expect(formatted).toContain("Semantic Testing:");
    expect(formatted).toContain("Total:            10");
    expect(formatted).toContain("Trigger Rate:     85.0%");
  });

  it("should omit semantic stats section when undefined", () => {
    const metrics = createEmptyMetrics();
    // No semantic_stats field

    const formatted = formatMetrics(metrics);

    expect(formatted).not.toContain("Semantic Testing:");
  });
});

describe("formatMetrics - cache_stats", () => {
  it("should include cache stats section when present", () => {
    const metrics = createEmptyMetrics();
    metrics.cache_stats = {
      total_cache_read_tokens: 5000,
      total_cache_creation_tokens: 1000,
      cache_hit_rate: 0.75,
    };

    const formatted = formatMetrics(metrics);

    expect(formatted).toContain("Cache Performance:");
    expect(formatted).toContain("Hit Rate:         75.0%");
    expect(formatted).toContain("Tokens Read:      5000");
    expect(formatted).toContain("Tokens Created:   1000");
  });

  it("should omit cache stats section when undefined", () => {
    const metrics = createEmptyMetrics();
    // No cache_stats field

    const formatted = formatMetrics(metrics);

    expect(formatted).not.toContain("Cache Performance:");
  });
});

describe("calculateComponentMetrics - edge cases", () => {
  it("should handle single-item arrays correctly", () => {
    const results = [
      {
        result: createEvalResult({
          triggered: true,
          quality_score: 9,
        }),
        scenario: createScenario({
          expected_component: "lonely-skill",
          expected_trigger: true,
        }),
        execution: createExecResult(),
      },
    ];

    const metrics = calculateComponentMetrics(results);

    expect(metrics["lonely-skill"]).toBeDefined();
    expect(metrics["lonely-skill"]?.scenarios_count).toBe(1);
    expect(metrics["lonely-skill"]?.trigger_rate).toBe(1);
    expect(metrics["lonely-skill"]?.avg_quality).toBe(9);
    expect(metrics["lonely-skill"]?.accuracy).toBe(1);
  });

  it("should handle empty results array", () => {
    const metrics = calculateComponentMetrics([]);

    expect(Object.keys(metrics)).toHaveLength(0);
  });
});

describe("calculateEvalMetrics - cache_stats", () => {
  it("should return undefined cache_stats when no cache data present", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult({
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
        }),
      },
    ];

    const metrics = calculateEvalMetrics(results, [results[0].execution]);

    expect(metrics.cache_stats).toBeUndefined();
  });

  it("should calculate correct cache hit rate with valid data", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult({
          cache_read_tokens: 500,
          cache_creation_tokens: 100,
          model_usage: {
            "claude-sonnet-4": {
              inputTokens: 1000,
              outputTokens: 200,
            },
          },
        }),
      },
    ];

    const metrics = calculateEvalMetrics(results, [results[0].execution]);

    expect(metrics.cache_stats).toBeDefined();
    expect(metrics.cache_stats?.total_cache_read_tokens).toBe(500);
    expect(metrics.cache_stats?.total_cache_creation_tokens).toBe(100);
    // Cache hit rate = 500 / 1000 = 0.5
    expect(metrics.cache_stats?.cache_hit_rate).toBe(0.5);
  });

  it("should return 0 cache hit rate when input tokens are zero", () => {
    const results = [
      {
        result: createEvalResult({ triggered: true }),
        scenario: createScenario({ expected_trigger: true }),
        execution: createExecResult({
          cache_read_tokens: 500,
          cache_creation_tokens: 100,
          // No model_usage means zero input tokens
        }),
      },
    ];

    const metrics = calculateEvalMetrics(results, [results[0].execution]);

    expect(metrics.cache_stats).toBeDefined();
    expect(metrics.cache_stats?.cache_hit_rate).toBe(0);
  });

  it("should aggregate cache tokens across multiple executions", () => {
    const exec1 = createExecResult({
      scenario_id: "test-1",
      cache_read_tokens: 300,
      cache_creation_tokens: 50,
      model_usage: {
        "claude-sonnet-4": { inputTokens: 600 },
      },
    });
    const exec2 = createExecResult({
      scenario_id: "test-2",
      cache_read_tokens: 200,
      cache_creation_tokens: 50,
      model_usage: {
        "claude-sonnet-4": { inputTokens: 400 },
      },
    });

    const results = [
      {
        result: createEvalResult({ scenario_id: "test-1", triggered: true }),
        scenario: createScenario({ id: "test-1", expected_trigger: true }),
        execution: exec1,
      },
      {
        result: createEvalResult({ scenario_id: "test-2", triggered: true }),
        scenario: createScenario({ id: "test-2", expected_trigger: true }),
        execution: exec2,
      },
    ];

    const metrics = calculateEvalMetrics(results, [exec1, exec2]);

    expect(metrics.cache_stats).toBeDefined();
    // 300 + 200 = 500
    expect(metrics.cache_stats?.total_cache_read_tokens).toBe(500);
    // 50 + 50 = 100
    expect(metrics.cache_stats?.total_cache_creation_tokens).toBe(100);
    // 500 / (600 + 400) = 0.5
    expect(metrics.cache_stats?.cache_hit_rate).toBe(0.5);
  });

  it("should handle mixed executions with and without cache data", () => {
    const execWithCache = createExecResult({
      scenario_id: "test-1",
      cache_read_tokens: 400,
      cache_creation_tokens: 100,
      model_usage: {
        "claude-sonnet-4": { inputTokens: 800 },
      },
    });
    const execWithoutCache = createExecResult({
      scenario_id: "test-2",
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      model_usage: {
        "claude-sonnet-4": { inputTokens: 200 },
      },
    });

    const results = [
      {
        result: createEvalResult({ scenario_id: "test-1", triggered: true }),
        scenario: createScenario({ id: "test-1", expected_trigger: true }),
        execution: execWithCache,
      },
      {
        result: createEvalResult({ scenario_id: "test-2", triggered: true }),
        scenario: createScenario({ id: "test-2", expected_trigger: true }),
        execution: execWithoutCache,
      },
    ];

    const metrics = calculateEvalMetrics(results, [
      execWithCache,
      execWithoutCache,
    ]);

    expect(metrics.cache_stats).toBeDefined();
    expect(metrics.cache_stats?.total_cache_read_tokens).toBe(400);
    expect(metrics.cache_stats?.total_cache_creation_tokens).toBe(100);
    // 400 / (800 + 200) = 0.4
    expect(metrics.cache_stats?.cache_hit_rate).toBe(0.4);
  });
});
