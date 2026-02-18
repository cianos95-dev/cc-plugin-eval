/**
 * Anthropic LLM Provider.
 *
 * Wraps the existing @anthropic-ai/sdk usage for backward compatibility.
 * Preserves prompt caching, structured output, and batch API support.
 *
 * Requires ANTHROPIC_API_KEY environment variable.
 */

import Anthropic from "@anthropic-ai/sdk";

import { resolveModelId } from "../config/models.js";
import { calculateCostFromUsage } from "../config/pricing.js";
import { logger } from "../utils/logging.js";

import type {
  LLMCompletionOptions,
  LLMProvider,
  LLMResponse,
  LLMStructuredCompletionOptions,
} from "./types.js";

/**
 * Default SDK timeout in milliseconds (2 minutes).
 */
const DEFAULT_SDK_TIMEOUT_MS = 120000;

/**
 * Anthropic LLM Provider implementation.
 *
 * Full-featured provider with prompt caching, structured output,
 * and batch API support.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly supportsStructuredOutput = true;
  readonly supportsPromptCaching = true;
  readonly supportsBatchAPI = true;

  private readonly client: Anthropic;

  constructor(apiKey?: string, timeout?: number) {
    const logLevel =
      process.env["ANTHROPIC_DEBUG"] === "true" ? "debug" : "warn";

    this.client = new Anthropic({
      apiKey,
      maxRetries: 0,
      timeout: timeout ?? DEFAULT_SDK_TIMEOUT_MS,
      logLevel,
      logger: {
        debug: (msg: string) => logger.debug(`[Anthropic SDK] ${msg}`),
        info: (msg: string) => logger.info(`[Anthropic SDK] ${msg}`),
        warn: (msg: string) => logger.warn(`[Anthropic SDK] ${msg}`),
        error: (msg: string) => logger.error(`[Anthropic SDK] ${msg}`),
      },
    });
  }

  /**
   * Get the underlying Anthropic client for advanced operations
   * (batch API, token counting, etc.).
   */
  getClient(): Anthropic {
    return this.client;
  }

  async createCompletion(options: LLMCompletionOptions): Promise<LLMResponse> {
    const result = await this.client.messages.create(
      {
        model: resolveModelId(options.model),
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        system: [
          {
            type: "text",
            text: options.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: options.userPrompt }],
      },
      { timeout: options.timeoutMs },
    );

    const textBlock = result.content.find((block) => block.type === "text");
    if (textBlock?.type !== "text") {
      throw new Error("No text content in LLM response");
    }

    return {
      text: textBlock.text,
      usage: {
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        cache_creation_input_tokens:
          result.usage.cache_creation_input_tokens ?? null,
        cache_read_input_tokens: result.usage.cache_read_input_tokens ?? null,
      },
    };
  }

  async createStructuredCompletion(
    options: LLMStructuredCompletionOptions,
  ): Promise<LLMResponse> {
    const result = await this.client.beta.messages.create(
      {
        model: resolveModelId(options.model),
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        system: [
          {
            type: "text",
            text: options.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: options.userPrompt }],
        betas: ["structured-outputs-2025-11-13"],
        output_format: {
          type: "json_schema",
          schema: options.schema,
        },
      },
      { timeout: options.timeoutMs },
    );

    const textBlock = result.content.find((block) => block.type === "text");
    if (textBlock?.type !== "text") {
      throw new Error("No text block in structured output response");
    }

    return {
      text: textBlock.text,
      usage: {
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        cache_creation_input_tokens:
          result.usage.cache_creation_input_tokens ?? null,
        cache_read_input_tokens: result.usage.cache_read_input_tokens ?? null,
      },
    };
  }

  async countTokens(
    model: string,
    text: string,
    system?: string,
  ): Promise<number | null> {
    const result = await this.client.messages.countTokens(
      {
        model: resolveModelId(model),
        messages: [{ role: "user", content: text }],
        ...(system !== undefined && {
          system: [{ type: "text" as const, text: system }],
        }),
      },
      { timeout: 30000 },
    );
    return result.input_tokens;
  }
}

/**
 * Calculate cost for an Anthropic LLM response.
 *
 * Utility for callers that need cost tracking with Anthropic-specific pricing.
 */
export function calculateAnthropicCost(
  usage: LLMResponse["usage"],
  model: string,
): number {
  return calculateCostFromUsage(usage, model);
}
