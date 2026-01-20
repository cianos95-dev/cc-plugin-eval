/**
 * LLM API utility functions for common patterns.
 */

import { resolveModelId } from "../config/models.js";
import { calculateCostFromUsage } from "../config/pricing.js";

import { withRetry } from "./retry.js";

import type Anthropic from "@anthropic-ai/sdk";

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
 * Makes an LLM API call with retry logic and prompt caching, returning the text response.
 *
 * This utility consolidates the common pattern of:
 * 1. Wrapping the call in retry logic for transient failures
 * 2. Setting up prompt caching with ephemeral cache control
 * 3. Resolving model aliases to full model IDs
 * 4. Extracting text content from the response
 *
 * @param client - The Anthropic client instance
 * @param options - Configuration options for the API call
 * @returns The text content from the LLM response
 * @throws Error if no text content is found in the response
 *
 * @example
 * ```ts
 * const text = await callLLMForText(client, {
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
  client: Anthropic,
  options: LLMCallOptions,
): Promise<string> {
  const { model, maxTokens, temperature, systemPrompt, userPrompt, timeoutMs } =
    options;

  return withRetry(async () => {
    const result = await client.messages.create(
      {
        model: resolveModelId(model),
        max_tokens: maxTokens,
        temperature,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userPrompt }],
      },
      { timeout: timeoutMs },
    );

    const textBlock = result.content.find((block) => block.type === "text");
    if (textBlock?.type !== "text") {
      throw new Error("No text content in LLM response");
    }

    return textBlock.text;
  });
}

/**
 * Makes an LLM API call with retry logic and prompt caching, returning the full message.
 *
 * Use this when you need access to the full response (e.g., for usage stats, stop reason).
 * For simpler cases where you only need text, use `callLLMForText` instead.
 *
 * @param client - The Anthropic client instance
 * @param options - Configuration options for the API call
 * @returns The full Message response from the API
 *
 * @example
 * ```ts
 * const message = await callLLMForMessage(client, {
 *   model: "sonnet",
 *   maxTokens: 4096,
 *   temperature: 0.7,
 *   systemPrompt: "You are a helpful assistant.",
 *   userPrompt: "Generate test scenarios for...",
 *   timeoutMs: 60000,
 * });
 * console.log(message.usage); // Access token usage stats
 * ```
 */
export async function callLLMForMessage(
  client: Anthropic,
  options: LLMCallOptions,
): Promise<Anthropic.Message> {
  const { model, maxTokens, temperature, systemPrompt, userPrompt, timeoutMs } =
    options;

  return withRetry(async () => {
    return client.messages.create(
      {
        model: resolveModelId(model),
        max_tokens: maxTokens,
        temperature,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userPrompt }],
      },
      { timeout: timeoutMs },
    );
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
 * Makes an LLM API call with retry logic and prompt caching, returning text and cost.
 *
 * This is similar to `callLLMForText` but also calculates and returns the cost
 * based on token usage. Use this when you need to track LLM costs.
 *
 * @param client - The Anthropic client instance
 * @param options - Configuration options for the API call
 * @returns Object containing the text response and calculated cost in USD
 *
 * @example
 * ```ts
 * const { text, cost_usd } = await callLLMForTextWithCost(client, {
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
  client: Anthropic,
  options: LLMCallOptions,
): Promise<LLMTextWithCostResult> {
  const message = await callLLMForMessage(client, options);

  const textBlock = message.content.find((block) => block.type === "text");
  if (textBlock?.type !== "text") {
    throw new Error("No text content in LLM response");
  }

  const cost_usd = calculateCostFromUsage(message.usage, options.model);

  return { text: textBlock.text, cost_usd };
}
