/**
 * Model pricing configuration.
 * Externalized for easy updates without code changes.
 * Last updated: 2026-02-19
 */

import { resolveModelId } from "./models.js";

import type { ModelPricing } from "../types/index.js";

/**
 * Model pricing per 1M tokens.
 * Cache creation costs ~1.25x input price.
 * Cache read costs ~0.1x input price.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Opus 4.6 (latest flagship)
  "claude-opus-4-6": {
    input: 5.0,
    output: 25.0,
    cache_creation: 6.25,
    cache_read: 0.5,
  },

  // Sonnet 4.6 (latest balanced)
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cache_creation: 3.75,
    cache_read: 0.3,
  },

  // Opus 4.5 (previous flagship, cost-reduced)
  "claude-opus-4-5-20251101": {
    input: 5.0,
    output: 25.0,
    cache_creation: 6.25,
    cache_read: 0.5,
  },

  // Opus 4.1 (legacy flagship)
  "claude-opus-4-1-20250805": {
    input: 15.0,
    output: 75.0,
    cache_creation: 18.75,
    cache_read: 1.5,
  },

  // Opus 4 (legacy)
  "claude-opus-4-20250514": {
    input: 15.0,
    output: 75.0,
    cache_creation: 18.75,
    cache_read: 1.5,
  },

  // Sonnet 4.5 (balanced)
  "claude-sonnet-4-5-20250929": {
    input: 3.0,
    output: 15.0,
    cache_creation: 3.75,
    cache_read: 0.3,
  },

  // Sonnet 4 (previous gen)
  "claude-sonnet-4-20250514": {
    input: 3.0,
    output: 15.0,
    cache_creation: 3.75,
    cache_read: 0.3,
  },

  // Haiku 4.5 (newer fast model)
  "claude-haiku-4-5-20251001": {
    input: 1.0,
    output: 5.0,
    cache_creation: 1.25,
    cache_read: 0.1,
  },

  // Haiku 3.5 (fast/cheap)
  "claude-haiku-3-5-20250929": {
    input: 0.8,
    output: 4.0,
    cache_creation: 1.0,
    cache_read: 0.08,
  },
};

/**
 * Default pricing fallback.
 */
const DEFAULT_PRICING: ModelPricing = {
  input: 3.0,
  output: 15.0,
  cache_creation: 3.75,
  cache_read: 0.3,
};

/**
 * Get pricing for a model, with fallback to default.
 *
 * @param modelId - Full model identifier
 * @returns Model pricing
 */
export function getModelPricing(modelId: string): ModelPricing {
  return MODEL_PRICING[modelId] ?? DEFAULT_PRICING;
}

/**
 * Calculate cost for a given usage.
 *
 * @param modelId - Full model identifier
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD
 */
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getModelPricing(modelId);
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}

/**
 * Calculate cost from Anthropic SDK Message usage data.
 *
 * Handles regular input/output tokens plus cache tokens with appropriate pricing.
 * This function accepts the SDK's native usage object, making it easy to calculate
 * costs from any API response without manual field extraction.
 *
 * @param usage - The usage object from Anthropic.Message or Anthropic.Beta.BetaMessage
 * @param modelId - Full model identifier
 * @returns Cost in USD
 */
export function calculateCostFromUsage(
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  },
  modelId: string,
): number {
  // Resolve model alias to full model ID before looking up pricing
  const resolvedModelId = resolveModelId(modelId);
  const pricing = getModelPricing(resolvedModelId);

  // Regular tokens
  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;

  // Cache tokens (may be undefined/null in some responses)
  const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

  const cacheCreationCost =
    (cacheCreationTokens / 1_000_000) * pricing.cache_creation;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.cache_read;

  return inputCost + outputCost + cacheCreationCost + cacheReadCost;
}

/**
 * Calculate savings from prompt caching.
 *
 * Computes the difference between what tokens would have cost as regular
 * input tokens versus their actual cost as cache creation/read tokens.
 *
 * @param cacheCreationTokens - Tokens used to create cache entries
 * @param cacheReadTokens - Tokens read from cache
 * @param modelId - Full model identifier
 * @returns Savings in USD (positive = saved money, negative = cost more)
 */
export function calculateCacheSavings(
  cacheCreationTokens: number,
  cacheReadTokens: number,
  modelId: string,
): number {
  if (cacheCreationTokens === 0 && cacheReadTokens === 0) {
    return 0;
  }

  const pricing = getModelPricing(modelId);
  const totalCacheTokens = cacheCreationTokens + cacheReadTokens;

  // Cost if these tokens were regular input tokens
  const costWithoutCaching = (totalCacheTokens / 1_000_000) * pricing.input;

  // Actual cost with caching
  const costWithCaching =
    (cacheCreationTokens / 1_000_000) * pricing.cache_creation +
    (cacheReadTokens / 1_000_000) * pricing.cache_read;

  return costWithoutCaching - costWithCaching;
}

/**
 * Format cost for display.
 *
 * @param costUsd - Cost in USD
 * @returns Formatted string
 */
export function formatCost(costUsd: number): string {
  if (costUsd < 0.01) {
    return `$${costUsd.toFixed(4)}`;
  }
  return `$${costUsd.toFixed(2)}`;
}
