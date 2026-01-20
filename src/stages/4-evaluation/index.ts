/**
 * Stage 4: Evaluation
 *
 * Detect component activation and assess quality.
 * Combines programmatic detection (PRIMARY) with LLM judgment (SECONDARY).
 *
 * Detection Strategy:
 * 1. Programmatic detection parses tool captures for 100% confidence
 * 2. LLM judge assesses quality and handles edge cases
 * 3. Conflict analysis detects multiple component triggers
 *
 * Batching:
 * When total LLM judge calls >= batch_threshold, uses Anthropic Batches API
 * for 50% cost savings on asynchronous evaluation.
 *
 * Output: results/{plugin-name}/evaluation.json
 */

import { resolveModelId } from "../../config/models.js";
import { parallel } from "../../utils/concurrency.js";
import {
  ensureDir,
  getResultsDir,
  writeJsonAsync,
} from "../../utils/file-io.js";
import { logger } from "../../utils/logging.js";
import { formatErrorWithRequestId } from "../../utils/retry.js";
import { createAnthropicClient } from "../2-generation/cost-estimator.js";

import {
  aggregateBatchResults,
  buildFinalResult,
  type EvaluationContext,
  type JudgeStrategy,
  type ProgrammaticResult,
  type ScenarioEvaluationResult,
} from "./aggregation/index.js";
import {
  shouldUseBatching,
  createEvaluationBatch,
  pollBatchCompletion,
  collectBatchResults,
  type BatchEvaluationRequest,
} from "./batch-evaluator.js";
import { calculateConflictSeverity } from "./conflict-tracker.js";
import {
  detectAllComponents,
  detectAllComponentsWithHooks,
  getUniqueDetections,
  wasExpectedComponentTriggered,
  wasExpectedHookTriggered,
} from "./detection/index.js";
import { createErrorJudgeResponse } from "./llm-judge.js";
import {
  calculateEvalMetrics,
  createEmptyMetrics,
  formatMetrics,
} from "./metrics.js";
import { runJudgment } from "./multi-sampler.js";

import type {
  EvalConfig,
  EvalMetrics,
  EvaluationResult,
  ExecutionResult,
  JudgeResponse,
  MultiSampleResult,
  ProgressCallbacks,
  TestScenario,
} from "../../types/index.js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Sample data entry for multi-sampling metrics.
 */
interface SampleDataEntry {
  scenarioId: string;
  variance: number;
  numSamples: number;
  hasConsensus: boolean;
}

/**
 * Result from runSynchronousEvaluation including cost tracking.
 */
interface SynchronousEvaluationResult {
  /** Scenario evaluation results */
  results: ScenarioEvaluationResult[];
  /** Total cost of all LLM judge calls in USD */
  total_cost_usd: number;
}

/**
 * Result from runBatchedEvaluation including cost tracking.
 */
interface BatchedEvaluationResult {
  /** Map of custom_id to JudgeResponse */
  results: Map<string, JudgeResponse>;
  /** Total cost of all batch requests in USD */
  total_cost_usd: number;
}

/**
 * Options for runSynchronousEvaluation.
 */
interface RunSynchronousEvaluationOptions {
  /** Anthropic client */
  client: Anthropic;
  /** Programmatic detection results */
  programmaticResults: ProgrammaticResult[];
  /** Evaluation configuration */
  config: EvalConfig;
  /** Progress callbacks */
  progress: ProgressCallbacks;
  /** Sample data array (mutated during evaluation) */
  sampleData: SampleDataEntry[];
}

/**
 * Options for calculateAndSaveMetrics.
 */
interface CalculateAndSaveMetricsOptions {
  /** Plugin name */
  pluginName: string;
  /** Results with scenario and execution context */
  resultsWithContext: {
    result: EvaluationResult;
    scenario: TestScenario;
    execution: ExecutionResult;
  }[];
  /** Execution results */
  executions: ExecutionResult[];
  /** Evaluation configuration */
  config: EvalConfig;
  /** Sample data for multi-sampling metrics */
  sampleData: SampleDataEntry[];
  /** Cost from Stage 2 generation */
  generationCostUsd?: number | undefined;
  /** Cost from Stage 4 evaluation LLM calls */
  evaluationCostUsd?: number | undefined;
}

/**
 * Options for runEvaluation.
 */
export interface RunEvaluationOptions {
  /** Plugin name */
  pluginName: string;
  /** Test scenarios */
  scenarios: TestScenario[];
  /** Execution results */
  executions: ExecutionResult[];
  /** Evaluation configuration */
  config: EvalConfig;
  /** Progress callbacks */
  progress?: ProgressCallbacks | undefined;
  /** Cost from Stage 2 generation */
  generationCostUsd?: number | undefined;
}

/**
 * Output from Stage 4: Evaluation.
 */
export interface EvaluationOutput {
  plugin_name: string;
  results: EvaluationResult[];
  metrics: EvalMetrics;
  /** Aggregate cost across all stages (generation + execution + evaluation) */
  total_cost_usd: number;
  /** Cost from Stage 2 generation LLM calls */
  generation_cost_usd: number;
  /** Cost from Stage 3 execution LLM calls */
  execution_cost_usd: number;
  /** Cost from Stage 4 evaluation LLM calls */
  evaluation_cost_usd: number;
  total_duration_ms: number;
}

/**
 * Determine whether LLM judge should be used.
 *
 * @param scenario - Test scenario
 * @param triggered - Whether component was triggered
 * @param detectionMode - Detection mode from config
 * @returns Judge strategy
 */
function determineJudgeStrategy(
  scenario: TestScenario,
  triggered: boolean,
  detectionMode: "programmatic_first" | "llm_only",
): JudgeStrategy {
  // llm_only mode always uses LLM
  if (detectionMode === "llm_only") {
    return { needsLLMJudge: true, detectionSource: "llm" };
  }

  // programmatic_first mode decision tree
  const triggeredAsExpected = triggered && scenario.expected_trigger;
  const falseNegative = !triggered && scenario.expected_trigger;
  const isNonDirectScenario = scenario.scenario_type !== "direct";

  // Use LLM for quality assessment, false negatives, or non-direct scenarios
  if (triggeredAsExpected || falseNegative || isNonDirectScenario) {
    return { needsLLMJudge: true, detectionSource: "both" };
  }

  // True negatives with direct scenarios - programmatic is sufficient
  return { needsLLMJudge: false, detectionSource: "programmatic" };
}

/**
 * Run programmatic detection for a scenario.
 * Returns intermediate results needed for LLM judgment and final evaluation.
 */
function runProgrammaticDetection(
  context: EvaluationContext,
  detectionMode: "programmatic_first" | "llm_only",
): ProgrammaticResult {
  const { scenario, execution } = context;

  // Programmatic detection
  // Use detectAllComponentsWithHooks for hooks (hook_responses) and agents (subagent_captures)
  // Otherwise use the simpler detectAllComponents
  const detections =
    scenario.component_type === "hook" || scenario.component_type === "agent"
      ? detectAllComponentsWithHooks({
          captures: execution.detected_tools,
          transcript: execution.transcript,
          scenario,
          ...(execution.hook_responses !== undefined && {
            hookResponses: execution.hook_responses,
          }),
          ...(execution.subagent_captures !== undefined && {
            subagentCaptures: execution.subagent_captures,
          }),
        })
      : detectAllComponents(
          execution.detected_tools,
          execution.transcript,
          scenario,
        );

  const uniqueDetections = getUniqueDetections(detections);

  // Check if expected component triggered
  const triggered =
    scenario.component_type === "hook"
      ? wasExpectedHookTriggered(
          execution.hook_responses ?? [],
          scenario.expected_component,
          scenario.component_ref.split("::")[0],
        )
      : wasExpectedComponentTriggered(
          uniqueDetections,
          scenario.expected_component,
          scenario.component_type,
        );

  // Conflict analysis
  const conflictAnalysis = calculateConflictSeverity(
    scenario.expected_component,
    scenario.component_type,
    uniqueDetections,
  );

  // Judge strategy
  const judgeStrategy = determineJudgeStrategy(
    scenario,
    triggered,
    detectionMode,
  );

  return {
    context,
    uniqueDetections,
    triggered,
    conflictAnalysis,
    judgeStrategy,
  };
}

/**
 * Run batched LLM evaluation using Anthropic Batches API.
 * Returns a map of scenario_id+sample to judgment results.
 */
async function runBatchedEvaluation(
  client: Anthropic,
  programmaticResults: ProgrammaticResult[],
  config: EvalConfig,
  _progress: ProgressCallbacks,
): Promise<BatchedEvaluationResult> {
  const { num_samples } = config.evaluation;

  // Collect all batch requests
  const batchRequests: BatchEvaluationRequest[] = [];
  for (const pr of programmaticResults) {
    if (!pr.judgeStrategy.needsLLMJudge) {
      continue;
    }

    for (let sampleIdx = 0; sampleIdx < num_samples; sampleIdx++) {
      batchRequests.push({
        scenario: pr.context.scenario,
        transcript: pr.context.execution.transcript,
        programmaticResult: pr.uniqueDetections,
        sampleIndex: sampleIdx,
      });
    }
  }

  if (batchRequests.length === 0) {
    return { results: new Map(), total_cost_usd: 0 };
  }

  logger.info(
    `Submitting ${String(batchRequests.length)} evaluation requests to Batches API (50% cost savings)`,
  );

  // Create batch
  const batchId = await createEvaluationBatch(
    client,
    batchRequests,
    config.evaluation,
  );
  logger.info(`Batch submitted: ${batchId}`);

  // Poll for completion
  const batch = await pollBatchCompletion(client, batchId, {
    pollIntervalMs: config.poll_interval_ms,
    timeoutMs: config.batch_timeout_ms,
    onProgress: (counts) => {
      const total =
        counts.processing +
        counts.succeeded +
        counts.errored +
        counts.canceled +
        counts.expired;
      logger.progress(
        counts.succeeded + counts.errored,
        total,
        `Batch processing: ${String(counts.succeeded)} succeeded, ${String(counts.errored)} errored`,
      );
    },
  });

  logger.success(
    `Batch complete: ${String(batch.request_counts.succeeded)} succeeded, ` +
      `${String(batch.request_counts.errored)} errored`,
  );

  // Collect results with cost tracking
  const modelId = resolveModelId(config.evaluation.model);
  return collectBatchResults(client, batchId, modelId);
}

/**
 * Run synchronous LLM evaluation (original behavior).
 */
async function runSynchronousEvaluation(
  options: RunSynchronousEvaluationOptions,
): Promise<SynchronousEvaluationResult> {
  const { client, programmaticResults, config, progress, sampleData } = options;
  const evalConfig = config.evaluation;

  // Track costs across all evaluations
  let totalCost = 0;

  const parallelResult = await parallel<
    ProgrammaticResult,
    ScenarioEvaluationResult
  >({
    items: programmaticResults,
    concurrency: config.max_concurrent,
    fn: async (pr: ProgrammaticResult, index: number) => {
      let judgment: MultiSampleResult | null = null;

      if (pr.judgeStrategy.needsLLMJudge) {
        try {
          judgment = await runJudgment({
            client,
            scenario: pr.context.scenario,
            transcript: pr.context.execution.transcript,
            programmaticResult: pr.uniqueDetections,
            config: evalConfig,
          });
          // Accumulate cost from judgment
          totalCost += judgment.total_cost_usd;
        } catch (err) {
          const errorResponse = createErrorJudgeResponse(
            formatErrorWithRequestId(err),
          );
          judgment = {
            individual_scores: [0],
            aggregated_score: 0,
            score_variance: 0,
            consensus_trigger_accuracy: "incorrect",
            is_unanimous: true,
            all_issues: errorResponse.issues,
            representative_response: errorResponse,
            total_cost_usd: 0, // No cost for error case
          };
        }
      }

      const evalResult = buildFinalResult(pr, judgment);

      // Track sample data if using multi-sampling
      if (config.evaluation.num_samples > 1 && judgment) {
        sampleData.push({
          scenarioId: evalResult.result.scenario_id,
          variance: evalResult.variance,
          numSamples: config.evaluation.num_samples,
          hasConsensus: evalResult.isUnanimous,
        });
      }

      logger.progress(
        index + 1,
        programmaticResults.length,
        `${evalResult.result.scenario_id}: ${evalResult.result.triggered ? "triggered" : "not triggered"}`,
      );

      return evalResult;
    },
    onError: (error: Error, pr: ProgrammaticResult) => {
      progress.onError?.(error, pr.context.scenario);
      logger.error(
        `Evaluation failed for ${pr.context.scenario.id}: ${error.message}`,
      );
    },
    continueOnError: true,
  });

  const results = (
    parallelResult.results as (ScenarioEvaluationResult | undefined)[]
  ).filter((r): r is ScenarioEvaluationResult => r !== undefined);

  return { results, total_cost_usd: totalCost };
}

/**
 * Calculate metrics and save evaluation results.
 *
 * @param pluginName - Plugin name
 * @param resultsWithContext - Results with scenario and execution context
 * @param executions - Execution results
 * @param config - Evaluation configuration
 * @param sampleData - Sample data for multi-sampling metrics
 * @returns Calculated metrics
 */
async function calculateAndSaveMetrics(
  options: CalculateAndSaveMetricsOptions,
): Promise<EvalMetrics> {
  const {
    pluginName,
    resultsWithContext,
    executions,
    config,
    sampleData,
    generationCostUsd,
    evaluationCostUsd,
  } = options;

  // Build metrics options
  const metricsOptions: {
    numSamples?: number | undefined;
    numReps?: number | undefined;
    sampleData?: typeof sampleData | undefined;
    flakyScenarios?: string[] | undefined;
    generationCostUsd?: number | undefined;
    evaluationCostUsd?: number | undefined;
  } = {
    numSamples: config.evaluation.num_samples,
    numReps: config.execution.num_reps,
    flakyScenarios: [],
    generationCostUsd,
    evaluationCostUsd,
  };

  if (sampleData.length > 0) {
    metricsOptions.sampleData = sampleData;
  }

  const metrics = calculateEvalMetrics(
    resultsWithContext,
    executions,
    metricsOptions,
  );

  // Log metrics summary
  logger.info(formatMetrics(metrics));

  // Save evaluation results
  const results = resultsWithContext.map((r) => r.result);
  await saveEvaluationResults(pluginName, results, metrics, config);

  return metrics;
}

/**
 * Run Stage 4: Evaluation.
 *
 * @param pluginName - Plugin name
 * @param scenarios - Test scenarios
 * @param executions - Execution results
 * @param config - Evaluation configuration
 * @param progress - Progress callbacks
 * @returns Evaluation output
 */
export async function runEvaluation(
  options: RunEvaluationOptions,
): Promise<EvaluationOutput> {
  const {
    pluginName,
    scenarios,
    executions,
    config,
    progress = {},
    generationCostUsd,
  } = options;

  logger.stageHeader("Stage 4: Evaluation", executions.length);

  const startTime = Date.now();

  // Handle empty executions
  if (executions.length === 0) {
    logger.warn("No executions to evaluate");
    return {
      plugin_name: pluginName,
      results: [],
      metrics: createEmptyMetrics(),
      total_cost_usd: 0,
      generation_cost_usd: 0,
      execution_cost_usd: 0,
      evaluation_cost_usd: 0,
      total_duration_ms: Date.now() - startTime,
    };
  }

  // Create Anthropic client for LLM judge (uses 2-minute default timeout)
  const client = createAnthropicClient();

  // Build scenario map for quick lookup
  const scenarioMap = new Map<string, TestScenario>();
  for (const scenario of scenarios) {
    scenarioMap.set(scenario.id, scenario);
  }

  // Build evaluation contexts
  const contexts: EvaluationContext[] = [];
  for (const execution of executions) {
    const scenario = scenarioMap.get(execution.scenario_id);
    if (scenario) {
      contexts.push({ scenario, execution });
    } else {
      logger.warn(`No scenario found for execution: ${execution.scenario_id}`);
    }
  }

  progress.onStageStart?.("evaluation", contexts.length);

  // Phase 1: Run programmatic detection for all scenarios
  logger.info("Running programmatic detection...");
  const programmaticResults = contexts.map((ctx) =>
    runProgrammaticDetection(ctx, config.evaluation.detection_mode),
  );

  // Count total LLM judge calls needed
  const scenariosNeedingJudge = programmaticResults.filter(
    (pr) => pr.judgeStrategy.needsLLMJudge,
  ).length;
  const totalJudgeCalls = scenariosNeedingJudge * config.evaluation.num_samples;

  // Determine if batching should be used
  const useBatching = shouldUseBatching({
    totalJudgeCalls,
    batchThreshold: config.batch_threshold,
    forceSynchronous: config.force_synchronous,
  });

  // Track sample data for metrics
  const sampleData: SampleDataEntry[] = [];

  let evalResults: ScenarioEvaluationResult[];
  let evaluationCost = 0;

  if (useBatching) {
    logger.info(
      `Using Batches API for ${String(totalJudgeCalls)} judge calls (threshold: ${String(config.batch_threshold)})`,
    );

    // Phase 2a: Run batched LLM evaluation
    const { results: batchResults, total_cost_usd: batchCost } =
      await runBatchedEvaluation(client, programmaticResults, config, progress);

    evaluationCost = batchCost;

    // Phase 3a: Build final results using batch responses
    evalResults = aggregateBatchResults(
      programmaticResults,
      batchResults,
      config,
      sampleData,
    );
  } else {
    logger.info(
      `Using synchronous evaluation for ${String(totalJudgeCalls)} judge calls ` +
        `(below threshold: ${String(config.batch_threshold)})`,
    );

    // Phase 2b: Run synchronous LLM evaluation
    const { results: syncResults, total_cost_usd: syncCost } =
      await runSynchronousEvaluation({
        client,
        programmaticResults,
        config,
        progress,
        sampleData,
      });

    evaluationCost = syncCost;
    evalResults = syncResults;
  }

  const results = evalResults.map((r) => r.result);

  // Build results with context for metrics
  // Invariant: Every result must have a matching context since results are derived
  // from contexts via programmatic detection. Missing context indicates a bug.
  const resultsWithContext = results.map((result) => {
    const context = contexts.find((c) => c.scenario.id === result.scenario_id);
    if (!context) {
      throw new Error(
        `Invariant violation: No context found for result scenario_id="${result.scenario_id}". ` +
          `This indicates a bug in evaluation flow - results should only exist for scenarios with context.`,
      );
    }
    return {
      result,
      scenario: context.scenario,
      execution: context.execution,
    };
  });

  // Calculate metrics and save results
  const metrics = await calculateAndSaveMetrics({
    pluginName,
    resultsWithContext,
    executions,
    config,
    sampleData,
    generationCostUsd,
    evaluationCostUsd: evaluationCost,
  });

  const totalDuration = Date.now() - startTime;

  // Calculate execution cost from executions
  const executionCost = executions.reduce((sum, e) => sum + e.cost_usd, 0);
  const generationCost = generationCostUsd ?? 0;
  const totalCost = generationCost + executionCost + evaluationCost;

  logger.success(
    `Evaluation complete: ${String(results.length)} scenarios evaluated, cost: $${evaluationCost.toFixed(4)}`,
  );
  progress.onStageComplete?.("evaluation", totalDuration, results.length);

  return {
    plugin_name: pluginName,
    results,
    metrics,
    total_cost_usd: totalCost,
    generation_cost_usd: generationCost,
    execution_cost_usd: executionCost,
    evaluation_cost_usd: evaluationCost,
    total_duration_ms: totalDuration,
  };
}

/**
 * Save evaluation results to disk.
 *
 * Asynchronous to avoid blocking the event loop for large evaluation files.
 *
 * @param pluginName - Plugin name
 * @param results - Evaluation results
 * @param metrics - Evaluation metrics
 * @param config - Configuration
 */
async function saveEvaluationResults(
  pluginName: string,
  results: EvaluationResult[],
  metrics: EvalMetrics,
  config: EvalConfig,
): Promise<void> {
  const resultsDir = getResultsDir(pluginName);
  ensureDir(resultsDir);

  const evaluationPath = `${resultsDir}/evaluation.json`;

  const output = {
    plugin_name: pluginName,
    timestamp: new Date().toISOString(),
    config: {
      detection_mode: config.evaluation.detection_mode,
      num_samples: config.evaluation.num_samples,
      aggregate_method: config.evaluation.aggregate_method,
      model: config.evaluation.model,
    },
    // Top-level cost breakdown for convenience
    total_cost_usd: metrics.total_cost_usd,
    generation_cost_usd: metrics.generation_cost_usd,
    execution_cost_usd: metrics.execution_cost_usd,
    evaluation_cost_usd: metrics.evaluation_cost_usd,
    metrics,
    results,
  };

  await writeJsonAsync(evaluationPath, output);
  logger.info(`Saved evaluation results to ${evaluationPath}`);
}

// Re-export components for direct use
export {
  detectAllComponents,
  detectAllComponentsWithHooks,
  detectFromCaptures,
  detectFromTranscript,
  detectDirectCommandInvocation,
  wasExpectedComponentTriggered,
  wasExpectedHookTriggered,
  getUniqueDetections,
} from "./detection/index.js";

export {
  calculateConflictSeverity,
  sharesDomain,
  countConflicts,
  getConflictSummary,
} from "./conflict-tracker.js";

export {
  evaluateWithLLMJudge,
  evaluateWithFallback,
  buildJudgePrompt,
  formatTranscriptWithIds,
  createErrorJudgeResponse,
} from "./llm-judge.js";

export {
  evaluateWithMultiSampling,
  evaluateSingleSample,
  runJudgment,
  aggregateScores,
  calculateVariance,
  isUnanimousVote,
} from "./multi-sampler.js";

export { getMajorityVote, type VoteResult } from "./judge-utils.js";

export {
  calculateEvalMetrics,
  calculateTriggerRate,
  calculateAccuracy,
  calculateAvgQuality,
  calculateComponentMetrics,
  formatMetrics,
  createEmptyMetrics,
} from "./metrics.js";

export {
  shouldUseBatching,
  createBatchRequests,
  createEvaluationBatch,
  pollBatchCompletion,
  collectBatchResults,
  parseCustomId,
  type BatchEvaluationRequest,
  type BatchingOptions,
  type PollOptions,
} from "./batch-evaluator.js";

export {
  aggregateBatchResults,
  buildEvaluationResult,
  buildFinalResult,
  judgeResponseToMultiSample,
  type EvaluationContext,
  type JudgeStrategy,
  type ProgrammaticResult,
  type ScenarioEvaluationResult,
} from "./aggregation/index.js";
