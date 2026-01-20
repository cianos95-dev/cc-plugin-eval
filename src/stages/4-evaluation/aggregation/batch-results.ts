/**
 * Batch result aggregation utilities.
 *
 * Functions for aggregating multi-sample batch evaluation results.
 */

import { getMajorityVote } from "../judge-utils.js";
import { createErrorJudgeResponse } from "../llm-judge.js";
import { calculateVariance } from "../multi-sampler.js";

import {
  buildFinalResult,
  judgeResponseToMultiSample,
} from "./scenario-results.js";

import type { ProgrammaticResult, ScenarioEvaluationResult } from "./types.js";
import type {
  EvalConfig,
  JudgeResponse,
  MultiSampleResult,
} from "../../../types/index.js";

/**
 * Aggregates batch evaluation results for multiple scenarios.
 *
 * For each programmatic result:
 * - If LLM judge not needed, builds result from programmatic detection only
 * - If LLM judge needed, collects all sample responses and aggregates scores
 *
 * @param programmaticResults - Results from programmatic detection phase
 * @param batchResults - Map of custom_id to JudgeResponse from batch API
 * @param config - Evaluation configuration
 * @param sampleData - Output array for sample metadata (mutated)
 * @returns Array of complete scenario evaluation results
 */
export function aggregateBatchResults(
  programmaticResults: ProgrammaticResult[],
  batchResults: Map<string, JudgeResponse>,
  config: EvalConfig,
  sampleData: {
    scenarioId: string;
    variance: number;
    numSamples: number;
    hasConsensus: boolean;
  }[],
): ScenarioEvaluationResult[] {
  return programmaticResults.map((pr) => {
    if (!pr.judgeStrategy.needsLLMJudge) {
      return buildFinalResult(pr, null);
    }

    // Collect all sample results for this scenario
    const sampleResponses: JudgeResponse[] = [];
    for (
      let sampleIdx = 0;
      sampleIdx < config.evaluation.num_samples;
      sampleIdx++
    ) {
      const customId = `${pr.context.scenario.id}_sample-${String(sampleIdx)}`;
      const response = batchResults.get(customId);
      if (response) {
        sampleResponses.push(response);
      }
    }

    if (sampleResponses.length === 0) {
      // All samples failed
      const errorResponse = createErrorJudgeResponse(
        "No batch results received",
      );
      return buildFinalResult(pr, judgeResponseToMultiSample(errorResponse, 0));
    }

    // Aggregate samples
    const scores = sampleResponses.map((r) => r.quality_score);
    const aggregatedScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const accuracyVotes = sampleResponses.map((r) => r.trigger_accuracy);
    const consensus = getMajorityVote(accuracyVotes);
    const isUnanimous = accuracyVotes.every((v) => v === accuracyVotes[0]);
    const variance = calculateVariance(scores);

    // sampleResponses[0] is guaranteed to exist because sampleResponses.length > 0
    // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
    const firstResponse = sampleResponses[0] as JudgeResponse;
    const multiSample: MultiSampleResult = {
      individual_scores: scores,
      aggregated_score: aggregatedScore,
      score_variance: variance,
      consensus_trigger_accuracy: consensus,
      is_unanimous: isUnanimous,
      all_issues: [...new Set(sampleResponses.flatMap((r) => r.issues))],
      representative_response: {
        ...firstResponse,
        quality_score: aggregatedScore,
        trigger_accuracy: consensus,
      },
      // Batch costs are tracked at the batch level, not per-scenario
      total_cost_usd: 0,
    };

    // Track sample data
    if (config.evaluation.num_samples > 1) {
      sampleData.push({
        scenarioId: pr.context.scenario.id,
        variance,
        numSamples: config.evaluation.num_samples,
        hasConsensus: isUnanimous,
      });
    }

    return buildFinalResult(pr, multiSample);
  });
}
