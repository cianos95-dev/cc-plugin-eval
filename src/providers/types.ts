/**
 * LLM Provider abstraction for multi-provider support.
 *
 * Allows Stages 2 (Generation) and 4 (Evaluation) to use
 * alternative LLM providers instead of direct Anthropic API calls.
 * Stage 3 (Execution) always uses Claude Agent SDK and is unaffected.
 */

/**
 * Token usage from an LLM response.
 */
export interface LLMUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * Response from an LLM completion call.
 */
export interface LLMResponse {
  /** The text content of the response */
  text: string;
  /** Token usage statistics */
  usage: LLMUsage;
}

/**
 * Options for creating a completion.
 */
export interface LLMCompletionOptions {
  /** Model name or alias */
  model: string;
  /** Maximum tokens for the response */
  maxTokens: number;
  /** Temperature for response generation (0-1) */
  temperature: number;
  /** System prompt text */
  systemPrompt: string;
  /** User prompt/message content */
  userPrompt: string;
  /** API timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Options for creating a structured (JSON schema) completion.
 */
export interface LLMStructuredCompletionOptions extends LLMCompletionOptions {
  /** JSON schema to enforce on the response */
  schema: Record<string, unknown>;
}

/**
 * Abstract LLM provider interface.
 *
 * Implementations must provide text completion and optionally
 * structured output and token counting capabilities.
 */
export interface LLMProvider {
  /** Provider name for logging and display */
  readonly name: string;

  /**
   * Whether this provider supports structured output (JSON schema enforcement).
   * If false, structured completions fall back to JSON-in-prompt approach.
   */
  readonly supportsStructuredOutput: boolean;

  /**
   * Whether this provider supports prompt caching.
   * Used for cost estimation accuracy.
   */
  readonly supportsPromptCaching: boolean;

  /**
   * Whether this provider supports the Anthropic Batches API.
   * If false, batching is disabled and evaluation runs synchronously.
   */
  readonly supportsBatchAPI: boolean;

  /**
   * Create a text completion.
   *
   * @param options - Completion options
   * @returns LLM response with text and usage
   */
  createCompletion(options: LLMCompletionOptions): Promise<LLMResponse>;

  /**
   * Create a structured output completion (JSON schema).
   *
   * Providers that don't support native structured output should
   * include the schema in the system prompt and parse JSON from the response.
   *
   * @param options - Structured completion options including schema
   * @returns LLM response with JSON text and usage
   */
  createStructuredCompletion(
    options: LLMStructuredCompletionOptions,
  ): Promise<LLMResponse>;

  /**
   * Count tokens for a prompt (optional).
   *
   * @param model - Model to use for counting
   * @param text - Text to count tokens for
   * @param system - Optional system prompt
   * @returns Token count, or null if not supported
   */
  countTokens?(
    model: string,
    text: string,
    system?: string,
  ): Promise<number | null>;
}

/**
 * Provider configuration in config.yaml.
 */
export interface ProviderConfig {
  /** Provider name: "anthropic" | "gemini" | "ollama" */
  name: string;
  /** Override model for generation stage */
  generation_model?: string;
  /** Override model for evaluation stage */
  evaluation_model?: string;
}
