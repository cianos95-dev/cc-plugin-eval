/**
 * Scenario result building utilities.
 *
 * Functions for constructing evaluation results from programmatic
 * detection and LLM judgment data.
 */

import type {
  DetectionSource,
  EvaluationResult,
  JudgeResponse,
  MultiSampleResult,
  TestScenario,
  TriggeredComponent,
} from "../../../types/index.js";
import type { calculateConflictSeverity } from "../conflict-tracker.js";
import type { ProgrammaticResult, ScenarioEvaluationResult } from "./types.js";
import type { getUniqueDetections } from "../detection/index.js";

/**
 * Build the evaluation result object.
 *
 * @param scenario - Test scenario being evaluated
 * @param triggered - Whether component was triggered
 * @param uniqueDetections - Unique component detections
 * @param conflictAnalysis - Conflict analysis result
 * @param judgment - LLM judgment result (null if programmatic-only)
 * @param detectionSource - How the trigger was detected
 * @returns Complete evaluation result
 */
export function buildEvaluationResult(
  scenario: TestScenario,
  triggered: boolean,
  uniqueDetections: ReturnType<typeof getUniqueDetections>,
  conflictAnalysis: ReturnType<typeof calculateConflictSeverity>,
  judgment: MultiSampleResult | null,
  detectionSource: DetectionSource,
): EvaluationResult {
  const allTriggeredComponents: TriggeredComponent[] = uniqueDetections.map(
    (d) => ({
      component_type: d.component_type,
      component_name: d.component_name,
      confidence: d.confidence,
    }),
  );

  const evidence = uniqueDetections.map((d) => d.evidence);

  // Use LLM quality score if available, otherwise infer from trigger correctness
  let qualityScore: number | null = null;
  if (judgment) {
    qualityScore = judgment.aggregated_score;
  } else if (triggered === scenario.expected_trigger) {
    qualityScore = triggered ? 7 : null;
  }

  const isCorrect = triggered === scenario.expected_trigger;

  return {
    scenario_id: scenario.id,
    triggered,
    confidence: uniqueDetections.length > 0 ? 100 : 0,
    quality_score: qualityScore,
    evidence,
    issues: judgment?.all_issues ?? [],
    summary:
      judgment?.representative_response.summary ??
      (isCorrect
        ? `Correctly ${triggered ? "triggered" : "did not trigger"} component`
        : `Incorrectly ${triggered ? "triggered" : "did not trigger"} component`),
    detection_source: detectionSource,
    all_triggered_components: allTriggeredComponents,
    has_conflict: conflictAnalysis.has_conflict,
    conflict_severity: conflictAnalysis.conflict_severity,
  };
}

/**
 * Build final scenario evaluation result from programmatic detection and judgment.
 *
 * @param programmatic - Programmatic detection result
 * @param judgment - LLM judgment result (null if programmatic-only)
 * @returns Complete scenario evaluation result with variance info
 */
export function buildFinalResult(
  programmatic: ProgrammaticResult,
  judgment: MultiSampleResult | null,
): ScenarioEvaluationResult {
  const {
    context,
    triggered,
    uniqueDetections,
    conflictAnalysis,
    judgeStrategy,
  } = programmatic;

  const result = buildEvaluationResult(
    context.scenario,
    triggered,
    uniqueDetections,
    conflictAnalysis,
    judgment,
    judgeStrategy.detectionSource,
  );

  const variance = judgment?.score_variance ?? 0;
  const isUnanimous = judgment?.is_unanimous ?? true;

  return { result, variance, isUnanimous };
}

/**
 * Convert a single JudgeResponse to MultiSampleResult format.
 *
 * Used when only a single sample is available (e.g., synchronous evaluation)
 * to maintain consistent data structure.
 *
 * @param response - Single judge response
 * @returns MultiSampleResult with single sample
 */
export function judgeResponseToMultiSample(
  response: JudgeResponse,
): MultiSampleResult {
  return {
    individual_scores: [response.quality_score],
    aggregated_score: response.quality_score,
    score_variance: 0,
    consensus_trigger_accuracy: response.trigger_accuracy,
    is_unanimous: true,
    all_issues: response.issues,
    representative_response: response,
  };
}
