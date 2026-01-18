import { describe, it, expect, vi, beforeEach } from "vitest";
import { aggregateBatchResults } from "../../../../../src/stages/4-evaluation/aggregation/batch-results.js";
import type {
  EvalConfig,
  JudgeResponse,
  TestScenario,
  ProgrammaticDetection,
  ConflictAnalysis,
  ExecutionResult,
  ComponentType,
} from "../../../../../src/types/index.js";
import type { ProgrammaticResult } from "../../../../../src/stages/4-evaluation/aggregation/types.js";

// Mock the dependencies
vi.mock("../../../../../src/stages/4-evaluation/judge-utils.js", () => ({
  getMajorityVote: vi.fn((votes) => {
    const counts: Record<string, number> = {};
    for (const v of votes) {
      counts[v] = (counts[v] ?? 0) + 1;
    }
    let maxKey = "incorrect";
    let maxCount = 0;
    for (const [key, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxKey = key;
      }
    }
    return maxKey;
  }),
}));

vi.mock("../../../../../src/stages/4-evaluation/llm-judge.js", () => ({
  createErrorJudgeResponse: vi.fn((message) => ({
    trigger_accuracy: "incorrect",
    quality_score: 0,
    response_relevance: 0,
    issues: [message],
    summary: "Error during evaluation",
  })),
}));

vi.mock("../../../../../src/stages/4-evaluation/multi-sampler.js", () => ({
  calculateVariance: vi.fn((scores: number[]) => {
    if (scores.length <= 1) return 0;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const squaredDiffs = scores.map((s) => (s - mean) ** 2);
    return squaredDiffs.reduce((a, b) => a + b, 0) / scores.length;
  }),
}));

// Helper factory functions
function createScenario(overrides: Partial<TestScenario> = {}): TestScenario {
  return {
    id: "test-scenario-1",
    component_type: "skill",
    component_ref: "test-skill",
    expected_component: "test-skill",
    expected_trigger: true,
    scenario_type: "direct",
    user_prompt: "Test prompt",
    ...overrides,
  };
}

function createDetection(name = "test-skill"): ProgrammaticDetection {
  return {
    component_type: "skill" as ComponentType,
    component_name: name,
    confidence: 100,
    evidence: "Detected via tool capture",
    tool_name: "Skill",
    timestamp: Date.now(),
  };
}

function createConflictAnalysis(): ConflictAnalysis {
  return {
    expected_component: "test-skill",
    expected_component_type: "skill",
    all_triggered_components: [],
    has_conflict: false,
    conflict_severity: "none",
  };
}

function createExecutionResult(
  scenarioId = "test-scenario-1",
): ExecutionResult {
  return {
    scenario_id: scenarioId,
    transcript: {
      events: [],
      metadata: {
        version: "v3.0",
        plugin_name: "test-plugin",
        scenario_id: scenarioId,
        timestamp: new Date().toISOString(),
        model: "claude-sonnet-4-20250514",
      },
    },
    detected_tools: [],
    cost_usd: 0,
    api_duration_ms: 100,
    num_turns: 1,
    errors: [],
    permission_denials: [],
  };
}

function createProgrammaticResult(
  overrides: Partial<{
    scenarioId: string;
    needsLLMJudge: boolean;
    triggered: boolean;
  }> = {},
): ProgrammaticResult {
  const scenarioId = overrides.scenarioId ?? "test-scenario-1";
  return {
    context: {
      scenario: createScenario({ id: scenarioId }),
      execution: createExecutionResult(scenarioId),
    },
    uniqueDetections: overrides.triggered !== false ? [createDetection()] : [],
    triggered: overrides.triggered ?? true,
    conflictAnalysis: createConflictAnalysis(),
    judgeStrategy: {
      needsLLMJudge: overrides.needsLLMJudge ?? true,
      detectionSource:
        overrides.needsLLMJudge !== false ? "both" : "programmatic",
    },
  };
}

function createJudgeResponse(
  overrides: Partial<JudgeResponse> = {},
): JudgeResponse {
  return {
    trigger_accuracy: "correct",
    quality_score: 8,
    response_relevance: 8,
    issues: [],
    summary: "Component triggered correctly",
    ...overrides,
  };
}

function createConfig(numSamples = 3): EvalConfig {
  return {
    plugin: {
      path: "/test/plugin",
    },
    scope: {
      skills: true,
      agents: true,
      commands: true,
      hooks: false,
      mcp_servers: false,
    },
    generation: {
      model: "claude-sonnet-4-20250514",
      scenarios_per_component: 3,
      diversity: 0.3,
      max_tokens: 1024,
      reasoning_effort: "low",
      semantic_variations: true,
      api_timeout_ms: 60000,
      temperature: 0.3,
    },
    execution: {
      model: "claude-sonnet-4-20250514",
      max_turns: 10,
      timeout_ms: 300000,
      max_budget_usd: 10,
      session_isolation: true,
      permission_bypass: true,
      disallowed_tools: ["Write", "Edit", "Bash"],
      num_reps: 1,
      additional_plugins: [],
    },
    evaluation: {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      detection_mode: "programmatic_first",
      reasoning_effort: "low",
      num_samples: numSamples,
      aggregate_method: "average",
      include_citations: false,
      api_timeout_ms: 120000,
      temperature: 0.1,
    },
    output: {
      format: "json",
      include_cli_summary: true,
      junit_test_suite_name: "cc-plugin-eval",
      sanitize_transcripts: false,
      sanitize_logs: false,
    },
    dry_run: false,
    estimate_costs: false,
    batch_threshold: 10,
    force_synchronous: false,
    poll_interval_ms: 1000,
    batch_timeout_ms: 3600000,
    rewind_file_changes: false,
    debug: false,
    verbose: false,
    max_concurrent: 5,
  };
}

describe("aggregateBatchResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns programmatic-only result when LLM judge not needed", () => {
    const programmaticResults = [
      createProgrammaticResult({ needsLLMJudge: false }),
    ];
    const batchResults = new Map<string, JudgeResponse>();
    const config = createConfig(1);
    const sampleData: Array<{
      scenarioId: string;
      variance: number;
      numSamples: number;
      hasConsensus: boolean;
    }> = [];

    const results = aggregateBatchResults(
      programmaticResults,
      batchResults,
      config,
      sampleData,
    );

    expect(results).toHaveLength(1);
    expect(results[0].result.triggered).toBe(true);
    expect(results[0].result.detection_source).toBe("programmatic");
    expect(sampleData).toHaveLength(0);
  });

  it("aggregates multiple sample responses correctly", () => {
    const programmaticResults = [createProgrammaticResult()];
    const batchResults = new Map<string, JudgeResponse>([
      ["test-scenario-1_sample-0", createJudgeResponse({ quality_score: 7 })],
      ["test-scenario-1_sample-1", createJudgeResponse({ quality_score: 8 })],
      ["test-scenario-1_sample-2", createJudgeResponse({ quality_score: 9 })],
    ]);
    const config = createConfig(3);
    const sampleData: Array<{
      scenarioId: string;
      variance: number;
      numSamples: number;
      hasConsensus: boolean;
    }> = [];

    const results = aggregateBatchResults(
      programmaticResults,
      batchResults,
      config,
      sampleData,
    );

    expect(results).toHaveLength(1);
    expect(results[0].result.quality_score).toBe(8); // average of 7, 8, 9
    expect(sampleData).toHaveLength(1);
    expect(sampleData[0].scenarioId).toBe("test-scenario-1");
    expect(sampleData[0].numSamples).toBe(3);
    expect(sampleData[0].hasConsensus).toBe(true);
  });

  it("handles non-unanimous trigger accuracy votes", () => {
    const programmaticResults = [createProgrammaticResult()];
    const batchResults = new Map<string, JudgeResponse>([
      [
        "test-scenario-1_sample-0",
        createJudgeResponse({ trigger_accuracy: "correct" }),
      ],
      [
        "test-scenario-1_sample-1",
        createJudgeResponse({ trigger_accuracy: "correct" }),
      ],
      [
        "test-scenario-1_sample-2",
        createJudgeResponse({ trigger_accuracy: "incorrect" }),
      ],
    ]);
    const config = createConfig(3);
    const sampleData: Array<{
      scenarioId: string;
      variance: number;
      numSamples: number;
      hasConsensus: boolean;
    }> = [];

    const results = aggregateBatchResults(
      programmaticResults,
      batchResults,
      config,
      sampleData,
    );

    expect(results[0].isUnanimous).toBe(false);
    expect(sampleData[0].hasConsensus).toBe(false);
  });

  it("handles missing batch results with error response", () => {
    const programmaticResults = [createProgrammaticResult()];
    const batchResults = new Map<string, JudgeResponse>(); // empty - no results
    const config = createConfig(3);
    const sampleData: Array<{
      scenarioId: string;
      variance: number;
      numSamples: number;
      hasConsensus: boolean;
    }> = [];

    const results = aggregateBatchResults(
      programmaticResults,
      batchResults,
      config,
      sampleData,
    );

    expect(results).toHaveLength(1);
    expect(results[0].result.quality_score).toBe(0);
    expect(results[0].result.issues).toContain("No batch results received");
  });

  it("processes multiple scenarios correctly", () => {
    const programmaticResults = [
      createProgrammaticResult({ scenarioId: "scenario-1" }),
      createProgrammaticResult({ scenarioId: "scenario-2" }),
    ];
    const batchResults = new Map<string, JudgeResponse>([
      ["scenario-1_sample-0", createJudgeResponse({ quality_score: 7 })],
      ["scenario-1_sample-1", createJudgeResponse({ quality_score: 7 })],
      ["scenario-1_sample-2", createJudgeResponse({ quality_score: 7 })],
      ["scenario-2_sample-0", createJudgeResponse({ quality_score: 9 })],
      ["scenario-2_sample-1", createJudgeResponse({ quality_score: 9 })],
      ["scenario-2_sample-2", createJudgeResponse({ quality_score: 9 })],
    ]);
    const config = createConfig(3);
    const sampleData: Array<{
      scenarioId: string;
      variance: number;
      numSamples: number;
      hasConsensus: boolean;
    }> = [];

    const results = aggregateBatchResults(
      programmaticResults,
      batchResults,
      config,
      sampleData,
    );

    expect(results).toHaveLength(2);
    expect(results[0].result.scenario_id).toBe("scenario-1");
    expect(results[0].result.quality_score).toBe(7);
    expect(results[1].result.scenario_id).toBe("scenario-2");
    expect(results[1].result.quality_score).toBe(9);
    expect(sampleData).toHaveLength(2);
  });

  it("deduplicates issues across samples", () => {
    const programmaticResults = [createProgrammaticResult()];
    const batchResults = new Map<string, JudgeResponse>([
      [
        "test-scenario-1_sample-0",
        createJudgeResponse({ issues: ["Issue A", "Issue B"] }),
      ],
      [
        "test-scenario-1_sample-1",
        createJudgeResponse({ issues: ["Issue A", "Issue C"] }),
      ],
      [
        "test-scenario-1_sample-2",
        createJudgeResponse({ issues: ["Issue B", "Issue C"] }),
      ],
    ]);
    const config = createConfig(3);
    const sampleData: Array<{
      scenarioId: string;
      variance: number;
      numSamples: number;
      hasConsensus: boolean;
    }> = [];

    const results = aggregateBatchResults(
      programmaticResults,
      batchResults,
      config,
      sampleData,
    );

    expect(results[0].result.issues).toHaveLength(3);
    expect(results[0].result.issues).toContain("Issue A");
    expect(results[0].result.issues).toContain("Issue B");
    expect(results[0].result.issues).toContain("Issue C");
  });

  it("skips sample data tracking for single-sample config", () => {
    const programmaticResults = [createProgrammaticResult()];
    const batchResults = new Map<string, JudgeResponse>([
      ["test-scenario-1_sample-0", createJudgeResponse()],
    ]);
    const config = createConfig(1);
    const sampleData: Array<{
      scenarioId: string;
      variance: number;
      numSamples: number;
      hasConsensus: boolean;
    }> = [];

    aggregateBatchResults(
      programmaticResults,
      batchResults,
      config,
      sampleData,
    );

    expect(sampleData).toHaveLength(0);
  });

  it("uses first response as representative with adjusted scores", () => {
    const programmaticResults = [createProgrammaticResult()];
    const batchResults = new Map<string, JudgeResponse>([
      [
        "test-scenario-1_sample-0",
        createJudgeResponse({
          quality_score: 7,
          trigger_accuracy: "correct",
          summary: "First response summary",
        }),
      ],
      [
        "test-scenario-1_sample-1",
        createJudgeResponse({
          quality_score: 9,
          trigger_accuracy: "correct",
          summary: "Second response summary",
        }),
      ],
    ]);
    const config = createConfig(2);
    const sampleData: Array<{
      scenarioId: string;
      variance: number;
      numSamples: number;
      hasConsensus: boolean;
    }> = [];

    const results = aggregateBatchResults(
      programmaticResults,
      batchResults,
      config,
      sampleData,
    );

    // Representative response should be first response but with aggregated score
    expect(results[0].result.summary).toBe("First response summary");
    expect(results[0].result.quality_score).toBe(8); // average of 7 and 9
  });
});
