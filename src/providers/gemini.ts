/**
 * Gemini API provider for LLM completions.
 *
 * Uses the Google Generative Language REST API with header-based authentication
 * via the `x-goog-api-key` header. The API key is never included in URL query
 * strings to prevent leakage through error messages, stack traces, and proxy logs.
 */

import { logger } from "../utils/logging.js";
import { withRetry } from "../utils/retry.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Gemini API message content part.
 */
export interface GeminiContentPart {
  text: string;
}

/**
 * Gemini API message content.
 */
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiContentPart[];
}

/**
 * Gemini generation configuration.
 */
export interface GeminiGenerationConfig {
  temperature?: number | undefined;
  maxOutputTokens?: number | undefined;
  topP?: number | undefined;
  topK?: number | undefined;
  responseMimeType?: string | undefined;
  responseSchema?: unknown;
}

/**
 * Gemini API system instruction.
 */
export interface GeminiSystemInstruction {
  parts: GeminiContentPart[];
}

/**
 * Gemini completion request body.
 */
export interface GeminiCompletionRequest {
  contents: GeminiContent[];
  generationConfig?: GeminiGenerationConfig;
  systemInstruction?: GeminiSystemInstruction;
}

/**
 * Gemini API response candidate.
 */
export interface GeminiCandidate {
  content: GeminiContent;
  finishReason: string;
}

/**
 * Gemini API usage metadata.
 */
export interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

/**
 * Gemini API completion response.
 */
export interface GeminiCompletionResponse {
  candidates: GeminiCandidate[];
  usageMetadata: GeminiUsageMetadata;
}

/**
 * Gemini API count tokens response.
 */
export interface GeminiCountTokensResponse {
  totalTokens: number;
}

/**
 * Gemini API error response body.
 */
interface GeminiErrorBody {
  error?: {
    message?: string;
    code?: number;
    status?: string;
  };
}

/**
 * Options for creating a Gemini provider.
 */
export interface GeminiProviderOptions {
  /** Gemini API key. */
  apiKey: string;
  /** Base URL for the Gemini API. Defaults to Google's generative language endpoint. */
  baseUrl?: string | undefined;
  /** Default model to use. Defaults to "gemini-2.0-flash". */
  defaultModel?: string | undefined;
  /** Request timeout in milliseconds. Defaults to 120000 (2 minutes). */
  timeoutMs?: number | undefined;
}

/**
 * Options for completion calls.
 */
export interface GeminiCompletionOptions {
  /** Model to use (overrides provider default). */
  model?: string | undefined;
  /** System prompt text. */
  systemPrompt?: string | undefined;
  /** User prompt text. */
  userPrompt: string;
  /** Temperature (0-2). */
  temperature?: number | undefined;
  /** Maximum output tokens. */
  maxOutputTokens?: number | undefined;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number | undefined;
}

/**
 * Options for structured completion calls.
 */
export interface GeminiStructuredCompletionOptions extends GeminiCompletionOptions {
  /** JSON schema for the response. */
  responseSchema: unknown;
}

/**
 * Options for token counting.
 */
export interface GeminiCountTokensOptions {
  /** Model to use (overrides provider default). */
  model?: string | undefined;
  /** Text to count tokens for. */
  text: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number | undefined;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.0-flash";
const DEFAULT_TIMEOUT_MS = 120000;

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Error class for Gemini API errors.
 *
 * Strips any API key from error messages to prevent credential leakage.
 */
export class GeminiApiError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Sanitize a string by removing any occurrence of the API key.
 *
 * @param text - The text to sanitize
 * @param apiKey - The API key to redact
 * @returns The sanitized text with the API key replaced
 */
function sanitizeApiKey(text: string, apiKey: string): string {
  if (apiKey.length === 0) {
    return text;
  }
  // Use split/join for literal string replacement (no regex escaping needed)
  return text.split(apiKey).join("[REDACTED_GEMINI_KEY]");
}

// =============================================================================
// Provider
// =============================================================================

/**
 * Gemini API provider.
 *
 * Authenticates via the `x-goog-api-key` HTTP header rather than URL query
 * parameters to prevent API key leakage in logs, error messages, and stack traces.
 */
export class GeminiProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultTimeoutMs: number;

  constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL;
    this.defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Create a text completion using the Gemini API.
   *
   * @param options - Completion options
   * @returns The completion response
   */
  async createCompletion(
    options: GeminiCompletionOptions,
  ): Promise<GeminiCompletionResponse> {
    const model = options.model ?? this.defaultModel;
    const url = `${this.baseUrl}/models/${model}:generateContent`;

    const body: GeminiCompletionRequest = {
      contents: [
        {
          role: "user",
          parts: [{ text: options.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
      },
    };

    if (options.systemPrompt !== undefined) {
      body.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    return withRetry(async () => {
      const response = await this.fetchWithAuth(url, body, options.timeoutMs);
      return response as GeminiCompletionResponse;
    });
  }

  /**
   * Create a structured (JSON) completion using the Gemini API.
   *
   * @param options - Structured completion options
   * @returns The completion response with structured output
   */
  async createStructuredCompletion(
    options: GeminiStructuredCompletionOptions,
  ): Promise<GeminiCompletionResponse> {
    const model = options.model ?? this.defaultModel;
    const url = `${this.baseUrl}/models/${model}:generateContent`;

    const body: GeminiCompletionRequest = {
      contents: [
        {
          role: "user",
          parts: [{ text: options.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
        responseMimeType: "application/json",
        responseSchema: options.responseSchema,
      },
    };

    if (options.systemPrompt !== undefined) {
      body.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    return withRetry(async () => {
      const response = await this.fetchWithAuth(url, body, options.timeoutMs);
      return response as GeminiCompletionResponse;
    });
  }

  /**
   * Count tokens for a given text using the Gemini API.
   *
   * @param options - Token counting options
   * @returns The total token count
   */
  async countTokens(options: GeminiCountTokensOptions): Promise<number> {
    const model = options.model ?? this.defaultModel;
    const url = `${this.baseUrl}/models/${model}:countTokens`;

    const body = {
      contents: [
        {
          role: "user" as const,
          parts: [{ text: options.text }],
        },
      ],
    };

    return withRetry(async () => {
      const response = await this.fetchWithAuth(url, body, options.timeoutMs);
      return (response as GeminiCountTokensResponse).totalTokens;
    });
  }

  /**
   * Execute an authenticated fetch request to the Gemini API.
   *
   * Uses the `x-goog-api-key` header for authentication. The API key is never
   * included in the URL. Error messages are sanitized to prevent key leakage.
   *
   * @param url - The API endpoint URL (without API key)
   * @param body - The request body
   * @param timeoutMs - Optional per-request timeout
   * @returns The parsed JSON response
   * @throws GeminiApiError if the request fails
   */
  private async fetchWithAuth(
    url: string,
    body: unknown,
    timeoutMs?: number,
  ): Promise<unknown> {
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

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
        const errorBody = (await response
          .json()
          .catch(() => ({}))) as GeminiErrorBody;
        const rawMessage =
          errorBody.error?.message ??
          `Gemini API error: HTTP ${String(response.status)}`;
        const safeMessage = sanitizeApiKey(rawMessage, this.apiKey);
        logger.error(`Gemini API request failed: ${safeMessage}`);
        throw new GeminiApiError(
          safeMessage,
          response.status,
          errorBody.error?.status,
        );
      }

      return await response.json();
    } catch (error: unknown) {
      if (error instanceof GeminiApiError) {
        throw error;
      }

      // Handle abort/timeout
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new GeminiApiError(
          `Gemini API request timed out after ${String(timeout)}ms`,
        );
      }

      // Sanitize any unexpected error messages that might contain the key
      const rawMessage = error instanceof Error ? error.message : String(error);
      const safeMessage = sanitizeApiKey(rawMessage, this.apiKey);
      throw new GeminiApiError(`Gemini API request failed: ${safeMessage}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create a Gemini provider instance from environment variables.
 *
 * Reads `GEMINI_API_KEY` from the environment. Optionally reads
 * `GEMINI_BASE_URL` for custom endpoints.
 *
 * @param options - Optional overrides for provider settings
 * @returns A configured GeminiProvider instance
 * @throws Error if GEMINI_API_KEY is not set
 */
export function createGeminiProvider(
  options: Partial<GeminiProviderOptions> = {},
): GeminiProvider {
  const apiKey = options.apiKey ?? process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is required for Gemini provider",
    );
  }

  return new GeminiProvider({
    apiKey,
    baseUrl: options.baseUrl ?? process.env["GEMINI_BASE_URL"],
    defaultModel: options.defaultModel,
    timeoutMs: options.timeoutMs,
  });
}
