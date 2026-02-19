/**
 * Gemini LLM Provider.
 *
 * Uses Google's Generative AI API (free tier: 1,000 req/day, 15 RPM).
 * Model: gemini-2.0-flash (fast, free).
 *
 * Requires GEMINI_API_KEY environment variable.
 */

import { logger } from "../utils/logging.js";

import type {
  LLMCompletionOptions,
  LLMProvider,
  LLMResponse,
  LLMStructuredCompletionOptions,
} from "./types.js";

/**
 * Rate limiter state for Gemini free tier (15 RPM).
 */
interface RateLimiterState {
  timestamps: number[];
  maxRequests: number;
  windowMs: number;
}

/**
 * Create a rate limiter for Gemini free tier.
 */
function createRateLimiter(
  maxRequests = 15,
  windowMs = 60000,
): RateLimiterState {
  return { timestamps: [], maxRequests, windowMs };
}

/**
 * Wait until a request can be made within rate limits.
 */
async function waitForRateLimit(state: RateLimiterState): Promise<void> {
  const now = Date.now();

  // Remove timestamps outside the window
  state.timestamps = state.timestamps.filter(
    (t) => now - t < state.windowMs,
  );

  if (state.timestamps.length >= state.maxRequests) {
    const oldest = state.timestamps[0]!;
    const waitMs = state.windowMs - (now - oldest) + 100; // +100ms buffer
    logger.debug(
      `Gemini rate limit: waiting ${String(waitMs)}ms (${String(state.timestamps.length)}/${String(state.maxRequests)} in window)`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  state.timestamps.push(Date.now());
}

/**
 * Default Gemini model for generation and evaluation.
 */
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

/**
 * Gemini API base URL.
 */
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Gemini API response types.
 */
interface GeminiCandidate {
  content: {
    parts: Array<{ text: string }>;
  };
}

interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

interface GeminiResponse {
  candidates: GeminiCandidate[];
  usageMetadata: GeminiUsageMetadata;
}

interface GeminiCountTokensResponse {
  totalTokens: number;
}

/**
 * Resolve a model name to a Gemini-compatible model ID.
 * Maps common aliases to Gemini models.
 */
function resolveGeminiModel(model: string): string {
  // If already a Gemini model, return as-is
  if (model.startsWith("gemini-")) {
    return model;
  }

  // Map common aliases
  const aliases: Record<string, string> = {
    sonnet: DEFAULT_GEMINI_MODEL,
    haiku: DEFAULT_GEMINI_MODEL,
    opus: DEFAULT_GEMINI_MODEL,
    flash: "gemini-2.0-flash",
    pro: "gemini-1.5-pro",
  };

  // Check for alias match
  for (const [alias, geminiModel] of Object.entries(aliases)) {
    if (model.toLowerCase().includes(alias)) {
      return geminiModel;
    }
  }

  // Default to flash for any Claude model reference
  if (model.startsWith("claude-")) {
    return DEFAULT_GEMINI_MODEL;
  }

  return model;
}

/**
 * Gemini LLM Provider implementation.
 *
 * Uses direct REST API calls to avoid SDK dependency.
 */
export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  readonly supportsStructuredOutput = true;
  readonly supportsPromptCaching = false;
  readonly supportsBatchAPI = false;

  private readonly apiKey: string;
  private readonly rateLimiter: RateLimiterState;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env["GEMINI_API_KEY"] ?? "";
    if (!this.apiKey) {
      throw new Error(
        "GEMINI_API_KEY environment variable is required for Gemini provider",
      );
    }
    this.rateLimiter = createRateLimiter();
  }

  async createCompletion(options: LLMCompletionOptions): Promise<LLMResponse> {
    await waitForRateLimit(this.rateLimiter);

    const model = resolveGeminiModel(options.model);
    const url = `${GEMINI_API_BASE}/models/${model}:generateContent`;

    const body = {
      systemInstruction: {
        parts: [{ text: options.systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: options.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      options.timeoutMs,
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Gemini API error (${String(response.status)}): ${errorText}`,
        );
      }

      const data = (await response.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const usage = data.usageMetadata;

      return {
        text,
        usage: {
          input_tokens: usage?.promptTokenCount ?? 0,
          output_tokens: usage?.candidatesTokenCount ?? 0,
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async createStructuredCompletion(
    options: LLMStructuredCompletionOptions,
  ): Promise<LLMResponse> {
    await waitForRateLimit(this.rateLimiter);

    const model = resolveGeminiModel(options.model);
    const url = `${GEMINI_API_BASE}/models/${model}:generateContent`;

    const body = {
      systemInstruction: {
        parts: [{ text: options.systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: options.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
        responseMimeType: "application/json",
        responseSchema: options.schema,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      options.timeoutMs,
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Gemini API error (${String(response.status)}): ${errorText}`,
        );
      }

      const data = (await response.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const usage = data.usageMetadata;

      return {
        text,
        usage: {
          input_tokens: usage?.promptTokenCount ?? 0,
          output_tokens: usage?.candidatesTokenCount ?? 0,
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async countTokens(
    model: string,
    text: string,
    system?: string,
  ): Promise<number | null> {
    await waitForRateLimit(this.rateLimiter);

    const geminiModel = resolveGeminiModel(model);
    const url = `${GEMINI_API_BASE}/models/${geminiModel}:countTokens`;

    const contents = [
      ...(system
        ? [{ role: "user" as const, parts: [{ text: system }] }]
        : []),
      { role: "user" as const, parts: [{ text }] },
    ];

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({ contents }),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as GeminiCountTokensResponse;
      return data.totalTokens ?? null;
    } catch {
      return null;
    }
  }
}
