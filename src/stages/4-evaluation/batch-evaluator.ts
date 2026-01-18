/**
 * Batch Evaluator - Anthropic Batches API integration for Stage 4.
 *
 * Provides 50% cost savings by using Anthropic's Batches API for
 * asynchronous LLM judge evaluations. Batching is used when the
 * total number of judge calls exceeds the configured threshold.
 *
 * Features:
 * - Batch request creation from evaluation contexts
 * - Polling with exponential backoff and timeout
 * - Result collection and parsing
 * - Graceful degradation on failures
 */

import { resolveModelId } from "../../config/models.js";
import { logger } from "../../utils/logging.js";
import { sleep } from "../../utils/retry.js";

import { parseJudgeResponse } from "./judge-utils.js";
import {
  buildJudgePrompt,
  JUDGE_RESPONSE_SCHEMA,
  JUDGE_SYSTEM_PROMPT,
} from "./llm-judge.js";

import type {
  EvaluationConfig,
  JudgeResponse,
  ProgrammaticDetection,
  TestScenario,
  Transcript,
} from "../../types/index.js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Batch evaluation request.
 * Contains all data needed to create a judge prompt for the batch.
 */
export interface BatchEvaluationRequest {
  /** Test scenario being evaluated */
  scenario: TestScenario;
  /** Execution transcript */
  transcript: Transcript;
  /** Programmatic detection results */
  programmaticResult: ProgrammaticDetection[];
  /** Sample index for multi-sampling (0 for single sample) */
  sampleIndex: number;
}

/**
 * Options for determining if batching should be used.
 */
export interface BatchingOptions {
  /** Total number of judge API calls needed */
  totalJudgeCalls: number;
  /** Minimum calls before batching kicks in */
  batchThreshold: number;
  /** Force synchronous execution */
  forceSynchronous: boolean;
}

/**
 * Options for polling batch completion.
 */
export interface PollOptions {
  /** Interval between polls in milliseconds */
  pollIntervalMs: number;
  /** Maximum time to wait for batch completion in milliseconds */
  timeoutMs: number;
  /** Optional AbortSignal for graceful cancellation */
  signal?: AbortSignal;
  /** Whether to call cancelBatch when abort signal is triggered (default: false) */
  cancelOnAbort?: boolean;
  /** Optional callback for progress updates */
  onProgress?: (
    counts: Anthropic.Messages.Batches.MessageBatchRequestCounts,
  ) => void;
}

/**
 * Batch request as expected by Anthropic API.
 *
 * Note: The Batches API uses MessageCreateParamsNonStreaming which has
 * limitations compared to the sync Messages API:
 * - No beta parameters (structured outputs via output_format unavailable)
 * - No prompt caching (cache_control not supported)
 *
 * To compensate, we include the JSON schema in the system prompt for
 * schema-aware prompting, and rely on Zod validation in parseJudgeResponse().
 */
export interface BatchRequest {
  custom_id: string;
  params: {
    model: string;
    max_tokens: number;
    /** System prompt with evaluation instructions and JSON schema guidance */
    system?: { type: "text"; text: string }[];
    messages: { role: "user"; content: string }[];
  };
}

/**
 * Determine if batching should be used based on configuration and request count.
 *
 * Batching is used when:
 * 1. Total judge calls >= batch_threshold
 * 2. force_synchronous is not set
 *
 * @param options - Batching configuration options
 * @returns True if batching should be used
 *
 * @example
 * ```typescript
 * const useBatching = shouldUseBatching({
 *   totalJudgeCalls: 100, // scenarios × num_samples
 *   batchThreshold: 50,
 *   forceSynchronous: false,
 * });
 *
 * if (useBatching) {
 *   // Use batch API for 50% cost savings
 * }
 * ```
 */
export function shouldUseBatching(options: BatchingOptions): boolean {
  const { totalJudgeCalls, batchThreshold, forceSynchronous } = options;

  if (forceSynchronous) {
    return false;
  }

  return totalJudgeCalls >= batchThreshold;
}

/**
 * Create a unique custom_id for a batch request.
 *
 * @param scenarioId - Scenario ID
 * @param sampleIndex - Sample index for multi-sampling
 * @returns Unique custom_id
 */
function createCustomId(scenarioId: string, sampleIndex: number): string {
  return `${scenarioId}_sample-${String(sampleIndex)}`;
}

/**
 * Parse custom_id back to scenario ID and sample index.
 *
 * @param customId - Custom ID to parse
 * @returns Parsed components or null if invalid
 */
export function parseCustomId(
  customId: string,
): { scenarioId: string; sampleIndex: number } | null {
  const match = /^(.+)_sample-(\d+)$/.exec(customId);
  if (!match) {
    return null;
  }

  const scenarioId = match[1];
  const sampleIndex = parseInt(match[2] ?? "0", 10);

  if (scenarioId === undefined || isNaN(sampleIndex)) {
    return null;
  }

  return { scenarioId, sampleIndex };
}

/**
 * Create batch requests from evaluation requests.
 *
 * Converts evaluation contexts into Anthropic batch request format.
 * Each request includes the judge prompt and model configuration.
 *
 * @param requests - Batch evaluation requests
 * @param config - Evaluation configuration
 * @returns Array of batch requests
 *
 * @example
 * ```typescript
 * const batchRequests = createBatchRequests(evaluationRequests, config);
 * const batch = await client.messages.batches.create({ requests: batchRequests });
 * ```
 */
export function createBatchRequests(
  requests: BatchEvaluationRequest[],
  config: EvaluationConfig,
): BatchRequest[] {
  // Build schema-aware system prompt for batch mode.
  // Since Batches API doesn't support structured outputs (output_format),
  // we include the JSON schema in the prompt to guide model output format.
  const schemaDoc = JSON.stringify(JUDGE_RESPONSE_SCHEMA, null, 2);
  const batchSystemPrompt = `${JUDGE_SYSTEM_PROMPT}

Respond ONLY with valid JSON matching this schema:
${schemaDoc}`;

  return requests.map((req) => {
    const prompt = buildJudgePrompt(
      req.scenario,
      req.transcript,
      req.programmaticResult,
      config,
    );

    return {
      custom_id: createCustomId(req.scenario.id, req.sampleIndex),
      params: {
        model: resolveModelId(config.model),
        max_tokens: config.max_tokens,
        system: [{ type: "text" as const, text: batchSystemPrompt }],
        messages: [{ role: "user" as const, content: prompt }],
      },
    };
  });
}

/**
 * Create an evaluation batch via Anthropic Batches API.
 *
 * Submits all evaluation requests as a single batch for asynchronous processing.
 * Returns the batch ID for polling and result collection.
 *
 * @param client - Anthropic client
 * @param requests - Batch evaluation requests
 * @param config - Evaluation configuration
 * @returns Batch ID
 *
 * @example
 * ```typescript
 * const batchId = await createEvaluationBatch(client, requests, config);
 * console.log(`Submitted batch: ${batchId}`);
 *
 * // Poll for completion
 * const batch = await pollBatchCompletion(client, batchId, { ... });
 * ```
 */
export async function createEvaluationBatch(
  client: Anthropic,
  requests: BatchEvaluationRequest[],
  config: EvaluationConfig,
): Promise<string> {
  const batchRequests = createBatchRequests(requests, config);

  const batch = await client.messages.batches.create({
    requests: batchRequests,
  });

  return batch.id;
}

/**
 * Poll for batch completion with timeout.
 *
 * Polls the batch status at regular intervals until processing ends.
 * Uses exponential backoff up to the poll interval.
 *
 * @param client - Anthropic client
 * @param batchId - Batch ID to poll
 * @param options - Poll options
 * @returns Completed batch status
 * @throws Error if timeout is reached
 *
 * @example
 * ```typescript
 * const batch = await pollBatchCompletion(client, batchId, {
 *   pollIntervalMs: 30000,
 *   timeoutMs: 1800000, // 30 minutes
 *   onProgress: (counts) => console.log(`Progress: ${counts.succeeded}/${total}`),
 * });
 * ```
 */
export async function pollBatchCompletion(
  client: Anthropic,
  batchId: string,
  options: PollOptions,
): Promise<Anthropic.Messages.Batches.MessageBatch> {
  const { pollIntervalMs, timeoutMs, signal, cancelOnAbort, onProgress } =
    options;
  const startTime = Date.now();
  let cancelInitiated = false;

  // Helper to handle abort with optional batch cancellation
  const handleAbort = async (): Promise<never> => {
    if (cancelOnAbort && !cancelInitiated) {
      cancelInitiated = true;
      await client.messages.batches.cancel(batchId);
    }
    throw new Error("Batch polling aborted");
  };

  // Check if already aborted before starting
  if (signal?.aborted) {
    return handleAbort();
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Infinite loop is intentional
  while (true) {
    const batch = await client.messages.batches.retrieve(batchId);

    // Report progress
    onProgress?.(batch.request_counts);

    // Check if batch is complete
    if (batch.processing_status === "ended") {
      return batch;
    }

    // Check for abort after retrieve (may have been triggered during await)
    if (signal?.aborted) {
      return handleAbort();
    }

    // Check timeout
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      throw new Error(
        `Batch ${batchId} timeout after ${String(elapsed)}ms - still ${batch.processing_status}`,
      );
    }

    // Wait before next poll
    await sleep(pollIntervalMs);

    // Check for abort after sleep
    if (signal?.aborted) {
      return handleAbort();
    }
  }
}

/**
 * Create an error judge response for failed batch requests.
 *
 * @param error - Error message
 * @returns Default judge response indicating failure
 */
function createErrorResponse(error: string): JudgeResponse {
  return {
    quality_score: 0,
    response_relevance: 0,
    trigger_accuracy: "incorrect",
    issues: [error],
    summary: `Batch evaluation failed: ${error}`,
  };
}

/**
 * Collect and parse batch results.
 *
 * Iterates through batch results and parses each judge response.
 * Handles succeeded, errored, canceled, and expired results.
 *
 * @param client - Anthropic client
 * @param batchId - Batch ID to collect results from
 * @returns Map of custom_id to parsed judge response
 *
 * @example
 * ```typescript
 * const results = await collectBatchResults(client, batchId);
 *
 * for (const [customId, response] of results) {
 *   const { scenarioId, sampleIndex } = parseCustomId(customId);
 *   console.log(`${scenarioId} sample ${sampleIndex}: ${response.quality_score}`);
 * }
 * ```
 */
export async function collectBatchResults(
  client: Anthropic,
  batchId: string,
): Promise<Map<string, JudgeResponse>> {
  const results = new Map<string, JudgeResponse>();

  const resultsIterator = await client.messages.batches.results(batchId);

  for await (const item of resultsIterator) {
    const customId = item.custom_id;

    switch (item.result.type) {
      case "succeeded": {
        const textBlock = item.result.message.content.find(
          (block) => block.type === "text",
        );
        if (textBlock?.type !== "text") {
          results.set(
            customId,
            createErrorResponse("No text block in batch response"),
          );
          break;
        }

        try {
          const response = parseJudgeResponse(textBlock.text);
          results.set(customId, response);
        } catch (err) {
          logger.error(`Failed to parse judge response for ${customId}`, {
            error: err,
            rawText: textBlock.text.slice(0, 500),
          });
          results.set(
            customId,
            createErrorResponse(
              `Failed to parse judge response: ${String(err)}`,
            ),
          );
        }
        break;
      }

      case "errored": {
        const errorType = item.result.error.type;
        results.set(
          customId,
          createErrorResponse(`Batch request failed: ${errorType}`),
        );
        break;
      }

      case "canceled": {
        results.set(
          customId,
          createErrorResponse("Batch request was canceled"),
        );
        break;
      }

      case "expired": {
        results.set(customId, createErrorResponse("Batch request expired"));
        break;
      }
    }
  }

  return results;
}
