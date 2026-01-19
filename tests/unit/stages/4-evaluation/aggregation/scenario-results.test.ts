import { describe, it, expect } from "vitest";
import {
  buildEvaluationResult,
  buildFinalResult,
  judgeResponseToMultiSample,
} from "../../../../../src/stages/4-evaluation/aggregation/scenario-results.js";
import type {
  JudgeResponse,
  MultiSampleResult,
  TestScenario,
  ProgrammaticDetection,
  ConflictAnalysis,
  ExecutionResult,
  ComponentType,
} from "../../../../../src/types/index.js";
import type { ProgrammaticResult } from "../../../../../src/stages/4-evaluation/aggregation/types.js";

// Helper factory for creating test scenarios
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

// Helper factory for creating unique detections
function createDetection(
  overrides: Partial<ProgrammaticDetection> = {},
): ProgrammaticDetection {
  return {
    component_type: "skill" as ComponentType,
    component_name: "test-skill",
    confidence: 100,
    evidence: "Detected via tool capture",
    tool_name: "Skill",
    timestamp: Date.now(),
    ...overrides,
  };
}

// Helper factory for creating conflict analysis
function createConflictAnalysis(
  overrides: Partial<ConflictAnalysis> = {},
): ConflictAnalysis {
  return {
    expected_component: "test-skill",
    expected_component_type: "skill",
    all_triggered_components: [],
    has_conflict: false,
    conflict_severity: "none",
    ...overrides,
  };
}

// Helper factory for creating judge responses
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

// Helper factory for creating multi-sample results
function createMultiSampleResult(
  overrides: Partial<MultiSampleResult> = {},
): MultiSampleResult {
  const response = createJudgeResponse(overrides.representative_response);
  return {
    individual_scores: [8],
    aggregated_score: 8,
    score_variance: 0,
    consensus_trigger_accuracy: "correct",
    is_unanimous: true,
    all_issues: [],
    representative_response: response,
    ...overrides,
  };
}

// Helper factory for creating execution results
function createExecutionResult(
  overrides: Partial<ExecutionResult> = {},
): ExecutionResult {
  return {
    scenario_id: "test-scenario-1",
    transcript: {
      events: [],
      metadata: {
        version: "v3.0",
        plugin_name: "test-plugin",
        scenario_id: "test-scenario-1",
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
    ...overrides,
  };
}

describe("buildEvaluationResult", () => {
  it("builds correct result for triggered component with LLM judgment", () => {
    const scenario = createScenario();
    const detections = [createDetection()];
    const conflictAnalysis = createConflictAnalysis();
    const judgment = createMultiSampleResult({ aggregated_score: 9 });

    const result = buildEvaluationResult({
      scenario,
      triggered: true,
      uniqueDetections: detections,
      conflictAnalysis,
      judgment,
      detectionSource: "both",
    });

    expect(result.scenario_id).toBe("test-scenario-1");
    expect(result.triggered).toBe(true);
    expect(result.confidence).toBe(100);
    expect(result.quality_score).toBe(9);
    expect(result.evidence).toEqual(["Detected via tool capture"]);
    expect(result.detection_source).toBe("both");
    expect(result.all_triggered_components).toEqual([
      {
        component_type: "skill",
        component_name: "test-skill",
        confidence: 100,
      },
    ]);
    expect(result.has_conflict).toBe(false);
    expect(result.conflict_severity).toBe("none");
  });

  it("builds correct result for non-triggered component without judgment", () => {
    const scenario = createScenario({ expected_trigger: false });
    const conflictAnalysis = createConflictAnalysis();

    const result = buildEvaluationResult({
      scenario,
      triggered: false,
      uniqueDetections: [], // no detections
      conflictAnalysis,
      judgment: null, // no judgment
      detectionSource: "programmatic",
    });

    expect(result.triggered).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.quality_score).toBeNull();
    expect(result.evidence).toEqual([]);
    expect(result.summary).toBe("Correctly did not trigger component");
    expect(result.all_triggered_components).toEqual([]);
  });

  it("infers quality score for correct trigger without judgment", () => {
    const scenario = createScenario({ expected_trigger: true });
    const detections = [createDetection()];
    const conflictAnalysis = createConflictAnalysis();

    const result = buildEvaluationResult({
      scenario,
      triggered: true,
      uniqueDetections: detections,
      conflictAnalysis,
      judgment: null,
      detectionSource: "programmatic",
    });

    expect(result.quality_score).toBe(7);
    expect(result.summary).toBe("Correctly triggered component");
  });

  it("handles incorrect trigger summary", () => {
    const scenario = createScenario({ expected_trigger: true });
    const conflictAnalysis = createConflictAnalysis();

    const result = buildEvaluationResult({
      scenario,
      triggered: false, // didn't trigger but was expected
      uniqueDetections: [],
      conflictAnalysis,
      judgment: null,
      detectionSource: "programmatic",
    });

    expect(result.summary).toBe("Incorrectly did not trigger component");
  });

  it("uses judgment summary when available", () => {
    const scenario = createScenario();
    const detections = [createDetection()];
    const conflictAnalysis = createConflictAnalysis();
    const judgment = createMultiSampleResult({
      representative_response: createJudgeResponse({
        summary: "Custom LLM summary",
      }),
    });

    const result = buildEvaluationResult({
      scenario,
      triggered: true,
      uniqueDetections: detections,
      conflictAnalysis,
      judgment,
      detectionSource: "both",
    });

    expect(result.summary).toBe("Custom LLM summary");
  });

  it("includes issues from judgment", () => {
    const scenario = createScenario();
    const detections = [createDetection()];
    const conflictAnalysis = createConflictAnalysis();
    const judgment = createMultiSampleResult({
      all_issues: ["Minor issue 1", "Minor issue 2"],
    });

    const result = buildEvaluationResult({
      scenario,
      triggered: true,
      uniqueDetections: detections,
      conflictAnalysis,
      judgment,
      detectionSource: "both",
    });

    expect(result.issues).toEqual(["Minor issue 1", "Minor issue 2"]);
  });

  it("handles conflict information", () => {
    const scenario = createScenario();
    const detections = [
      createDetection({ component_name: "skill-1" }),
      createDetection({ component_name: "skill-2" }),
    ];
    const conflictAnalysis = createConflictAnalysis({
      has_conflict: true,
      conflict_severity: "major",
      all_triggered_components: [
        { component_type: "skill", component_name: "skill-1", confidence: 100 },
        { component_type: "skill", component_name: "skill-2", confidence: 100 },
      ],
    });

    const result = buildEvaluationResult({
      scenario,
      triggered: true,
      uniqueDetections: detections,
      conflictAnalysis,
      judgment: null,
      detectionSource: "programmatic",
    });

    expect(result.has_conflict).toBe(true);
    expect(result.conflict_severity).toBe("major");
    expect(result.all_triggered_components).toHaveLength(2);
  });
});

describe("buildFinalResult", () => {
  const createProgrammaticResult = (
    overrides: Partial<ProgrammaticResult> = {},
  ): ProgrammaticResult => ({
    context: {
      scenario: createScenario(),
      execution: createExecutionResult(),
    },
    uniqueDetections: [createDetection()],
    triggered: true,
    conflictAnalysis: createConflictAnalysis(),
    judgeStrategy: { needsLLMJudge: false, detectionSource: "programmatic" },
    ...overrides,
  });

  it("builds result without judgment", () => {
    const programmatic = createProgrammaticResult();

    const result = buildFinalResult(programmatic, null);

    expect(result.result.scenario_id).toBe("test-scenario-1");
    expect(result.result.triggered).toBe(true);
    expect(result.variance).toBe(0);
    expect(result.isUnanimous).toBe(true);
  });

  it("includes variance and unanimity from judgment", () => {
    const programmatic = createProgrammaticResult();
    const judgment = createMultiSampleResult({
      score_variance: 0.5,
      is_unanimous: false,
    });

    const result = buildFinalResult(programmatic, judgment);

    expect(result.variance).toBe(0.5);
    expect(result.isUnanimous).toBe(false);
  });

  it("passes detection source from judge strategy", () => {
    const programmatic = createProgrammaticResult({
      judgeStrategy: { needsLLMJudge: true, detectionSource: "both" },
    });
    const judgment = createMultiSampleResult();

    const result = buildFinalResult(programmatic, judgment);

    expect(result.result.detection_source).toBe("both");
  });
});

describe("judgeResponseToMultiSample", () => {
  it("converts single response to multi-sample format", () => {
    const response = createJudgeResponse({
      quality_score: 7,
      trigger_accuracy: "partial",
      issues: ["Issue 1"],
      summary: "Partially correct",
    });

    const result = judgeResponseToMultiSample(response);

    expect(result.individual_scores).toEqual([7]);
    expect(result.aggregated_score).toBe(7);
    expect(result.score_variance).toBe(0);
    expect(result.consensus_trigger_accuracy).toBe("partial");
    expect(result.is_unanimous).toBe(true);
    expect(result.all_issues).toEqual(["Issue 1"]);
    expect(result.representative_response).toBe(response);
  });

  it("handles incorrect trigger accuracy", () => {
    const response = createJudgeResponse({
      trigger_accuracy: "incorrect",
      quality_score: 0,
    });

    const result = judgeResponseToMultiSample(response);

    expect(result.consensus_trigger_accuracy).toBe("incorrect");
    expect(result.aggregated_score).toBe(0);
  });
});
