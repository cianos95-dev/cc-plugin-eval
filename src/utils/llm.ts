/**
 * LLM API utility functions for common patterns.
 *
 * Updated to use LLMProvider abstraction for multi-provider support.
 * Backward compatible: still accepts Anthropic client via AnthropicProvider.
 */

import { calculateCostFromUsage } from "../config/pricing.js";

import { withRetry } from "./retry.js";

import type { LLMProvider } from "../providers/types.js";

/**
 * Options for making LLM API calls.
 */
export interface LLMCallOptions {
  /** Model name or alias (e.g., "sonnet", "claude-sonnet-4.5") */
  model: string;
  /** Maximum tokens for the response */
  maxTokens: number;
  /** Temperature for response generation (0-1) */
  temperature: number;
  /** System prompt text (will be cached with ephemeral cache control) */
  systemPrompt: string;
  /** User prompt/message content */
  userPrompt: string;
  /** API timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Makes an LLM API call with retry logic, returning the text response.
 *
 * This utility consolidates the common pattern of:
 * 1. Wrapping the call in retry logic for transient failures
 * 2. Resolving model aliases to full model IDs
 * 3. Extracting text content from the response
 *
 * @param provider - The LLM provider instance
 * @param options - Configuration options for the API call
 * @returns The text content from the LLM response
 * @throws Error if no text content is found in the response
 *
 * @example
 * ```ts
 * const text = await callLLMForText(provider, {
 *   model: "sonnet",
 *   maxTokens: 4096,
 *   temperature: 0.7,
 *   systemPrompt: "You are a helpful assistant.",
 *   userPrompt: "Generate test scenarios for...",
 *   timeoutMs: 60000,
 * });
 * ```
 */
export async function callLLMForText(
  provider: LLMProvider,
  options: LLMCallOptions,
): Promise<string> {
  const { model, maxTokens, temperature, systemPrompt, userPrompt, timeoutMs } =
    options;

  return withRetry(async () => {
    const result = await provider.createCompletion({
      model,
      maxTokens,
      temperature,
      systemPrompt,
      userPrompt,
      timeoutMs,
    });

    return result.text;
  });
}

/**
 * Result from callLLMForTextWithCost including the text response and cost.
 */
export interface LLMTextWithCostResult {
  /** The extracted text content from the LLM response */
  text: string;
  /** The calculated cost in USD based on token usage */
  cost_usd: number;
}

/**
 * Makes an LLM API call with retry logic, returning text and cost.
 *
 * This is similar to `callLLMForText` but also calculates and returns the cost
 * based on token usage. Use this when you need to track LLM costs.
 *
 * @param provider - The LLM provider instance
 * @param options - Configuration options for the API call
 * @returns Object containing the text response and calculated cost in USD
 *
 * @example
 * ```ts
 * const { text, cost_usd } = await callLLMForTextWithCost(provider, {
 *   model: "sonnet",
 *   maxTokens: 4096,
 *   temperature: 0.7,
 *   systemPrompt: "You are a helpful assistant.",
 *   userPrompt: "Generate test scenarios for...",
 *   timeoutMs: 60000,
 * });
 * console.log(`Cost: $${cost_usd.toFixed(4)}`);
 * ```
 */
export async function callLLMForTextWithCost(
  provider: LLMProvider,
  options: LLMCallOptions,
): Promise<LLMTextWithCostResult> {
  const { model, maxTokens, temperature, systemPrompt, userPrompt, timeoutMs } =
    options;

  return withRetry(async () => {
    const result = await provider.createCompletion({
      model,
      maxTokens,
      temperature,
      systemPrompt,
      userPrompt,
      timeoutMs,
    });

    // Calculate cost using Anthropic pricing model.
    // For non-Anthropic providers, this returns $0 since their pricing
    // models don't match (and free-tier providers have no cost).
    const cost_usd = provider.supportsPromptCaching
      ? calculateCostFromUsage(result.usage, model)
      : 0;

    return { text: result.text, cost_usd };
  });
}
