/**
 * Provider factory and exports.
 *
 * Auto-detects available provider based on environment variables,
 * or uses explicit configuration from config.yaml.
 */

import { logger } from "../utils/logging.js";

import { AnthropicProvider } from "./anthropic.js";
import { GeminiProvider } from "./gemini.js";
import { OllamaProvider } from "./ollama.js";

import type { LLMProvider, ProviderConfig } from "./types.js";

/**
 * Create an LLM provider based on configuration or auto-detection.
 *
 * Priority:
 * 1. Explicit config.provider.name
 * 2. LLM_PROVIDER environment variable
 * 3. Auto-detect from available API keys
 *
 * @param config - Optional provider configuration
 * @returns LLM provider instance
 */
export function createLLMProvider(config?: ProviderConfig): LLMProvider {
  const providerName =
    config?.name ??
    process.env["LLM_PROVIDER"] ??
    detectAvailableProvider();

  logger.info(`Using LLM provider: ${providerName}`);

  switch (providerName) {
    case "gemini":
      return new GeminiProvider();
    case "ollama":
      return new OllamaProvider();
    case "anthropic":
      return new AnthropicProvider();
    default:
      throw new Error(
        `Unknown LLM provider: ${providerName}. Supported: anthropic, gemini, ollama`,
      );
  }
}

/**
 * Auto-detect available provider from environment variables.
 *
 * Checks for API keys in order of preference:
 * 1. GEMINI_API_KEY → gemini (free tier, recommended)
 * 2. ANTHROPIC_API_KEY → anthropic (costs money)
 * 3. fallback → ollama (local, requires Ollama running)
 */
function detectAvailableProvider(): string {
  if (process.env["GEMINI_API_KEY"]) {
    logger.debug("Auto-detected Gemini provider (GEMINI_API_KEY found)");
    return "gemini";
  }

  if (process.env["ANTHROPIC_API_KEY"]) {
    logger.debug("Auto-detected Anthropic provider (ANTHROPIC_API_KEY found)");
    return "anthropic";
  }

  logger.debug("No API keys found, falling back to Ollama (local)");
  return "ollama";
}

/**
 * Check if a provider is the Anthropic provider.
 * Useful for enabling Anthropic-specific features (batch API, etc.).
 */
export function isAnthropicProvider(
  provider: LLMProvider,
): provider is AnthropicProvider {
  return provider.name === "anthropic";
}

// Re-export types and implementations
export { AnthropicProvider } from "./anthropic.js";
export { GeminiProvider } from "./gemini.js";
export { OllamaProvider } from "./ollama.js";
export type { LLMProvider, LLMResponse, LLMUsage, ProviderConfig } from "./types.js";
