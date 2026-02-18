/**
 * Ollama LLM Provider.
 *
 * Uses Ollama's OpenAI-compatible API at localhost.
 * Models: llama3.2, qwen2.5-coder, mistral, etc.
 * No token counting, no structured output guarantee.
 *
 * Requires Ollama running locally (default: http://localhost:11434).
 */

import type {
  LLMCompletionOptions,
  LLMProvider,
  LLMResponse,
  LLMStructuredCompletionOptions,
} from "./types.js";

/**
 * Default Ollama model.
 */
const DEFAULT_OLLAMA_MODEL = "llama3.2";

/**
 * Ollama API response types (OpenAI-compatible).
 */
interface OllamaChoice {
  message: { content: string };
}

interface OllamaUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

interface OllamaChatResponse {
  choices: OllamaChoice[];
  usage?: OllamaUsage;
}

/**
 * Resolve a model name to an Ollama-compatible model.
 */
function resolveOllamaModel(model: string): string {
  if (
    model.startsWith("llama") ||
    model.startsWith("qwen") ||
    model.startsWith("mistral") ||
    model.startsWith("phi") ||
    model.startsWith("gemma")
  ) {
    return model;
  }

  // Map Claude model references to Ollama defaults
  if (model.startsWith("claude-") || model === "sonnet" || model === "haiku" || model === "opus") {
    return DEFAULT_OLLAMA_MODEL;
  }

  return model;
}

/**
 * Ollama LLM Provider implementation.
 *
 * Uses Ollama's OpenAI-compatible chat completions API.
 */
export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  readonly supportsStructuredOutput = false;
  readonly supportsPromptCaching = false;
  readonly supportsBatchAPI = false;

  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl ?? process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434";
  }

  async createCompletion(options: LLMCompletionOptions): Promise<LLMResponse> {
    const model = resolveOllamaModel(options.model);
    const url = `${this.baseUrl}/v1/chat/completions`;

    const body = {
      model,
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userPrompt },
      ],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      options.timeoutMs,
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama API error (${String(response.status)}): ${errorText}`,
        );
      }

      const data = (await response.json()) as OllamaChatResponse;
      const text = data.choices?.[0]?.message?.content ?? "";

      return {
        text,
        usage: {
          input_tokens: data.usage?.prompt_tokens ?? 0,
          output_tokens: data.usage?.completion_tokens ?? 0,
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async createStructuredCompletion(
    options: LLMStructuredCompletionOptions,
  ): Promise<LLMResponse> {
    // Ollama doesn't support native structured output.
    // Include schema in the system prompt and request JSON output.
    const schemaDoc = JSON.stringify(options.schema, null, 2);
    const enhancedSystemPrompt = `${options.systemPrompt}

Respond with ONLY a valid JSON object matching this schema:
${schemaDoc}

No markdown, no explanation - just the JSON.`;

    return this.createCompletion({
      ...options,
      systemPrompt: enhancedSystemPrompt,
    });
  }

  // Token counting not supported by Ollama
  // The interface makes countTokens optional, so we don't implement it
}
