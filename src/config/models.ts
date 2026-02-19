/**
 * Model alias resolution for Claude models.
 *
 * This module provides a single source of truth for model alias resolution,
 * mapping human-friendly model names to their full API identifiers.
 *
 * ## Alias Patterns
 *
 * Each model family supports multiple alias formats:
 *
 * - **Unversioned** (e.g., `opus`, `sonnet`, `haiku`): Maps to the latest version
 * - **Versioned** (e.g., `opus-4.5`, `sonnet-4`, `haiku-3.5`): Specific version
 * - **Full name** (e.g., `claude-opus-4.5`, `claude-sonnet-4`): Explicit model name
 *
 * ## Model Defaults
 *
 * When using unversioned aliases:
 * - `opus` → Claude Opus 4.6 (latest flagship)
 * - `sonnet` → Claude Sonnet 4.6 (balanced performance)
 * - `haiku` → Claude Haiku 4.5 (fast and efficient)
 *
 * ## Updating for New Models
 *
 * When new models are released:
 * 1. Add the full model ID to `MODEL_PRICING` in `pricing.ts`
 * 2. Add aliases here in `MODEL_ALIASES`
 * 3. Update the unversioned alias if the new model becomes the default
 *
 * @module config/models
 */

// =============================================================================
// Default Model IDs
// =============================================================================
// These constants define the canonical model IDs for each model family.
// When updating to new model versions, change only these constants.
// All other files should import and use these constants.

/** Claude Opus 4.6 - latest flagship model. */
export const MODEL_OPUS_4_6 = "claude-opus-4-6";

/** Claude Sonnet 4.6 - latest balanced performance model. */
export const MODEL_SONNET_4_6 = "claude-sonnet-4-6";

/** Claude Opus 4.5 - previous flagship model with cost-reduced pricing. */
export const MODEL_OPUS_4_5 = "claude-opus-4-5-20251101";

/** Claude Sonnet 4.5 - previous balanced performance model. */
export const MODEL_SONNET_4_5 = "claude-sonnet-4-5-20250929";

/** Claude Haiku 4.5 - fast and efficient model. */
export const MODEL_HAIKU_4_5 = "claude-haiku-4-5-20251001";

/**
 * Mapping from model aliases to their full API model identifiers.
 *
 * All aliases resolve to model IDs that are valid keys in `MODEL_PRICING`.
 */
export const MODEL_ALIASES: Readonly<Record<string, string>> = {
  // Opus 4.6 (latest flagship)
  "claude-opus-4.6": MODEL_OPUS_4_6,
  "opus-4.6": MODEL_OPUS_4_6,
  opus: MODEL_OPUS_4_6, // Default to latest Opus

  // Opus 4.5 (previous flagship, cost-reduced)
  "claude-opus-4.5": MODEL_OPUS_4_5,
  "opus-4.5": MODEL_OPUS_4_5,

  // Opus 4.1 (legacy flagship)
  "claude-opus-4.1": "claude-opus-4-1-20250805",
  "opus-4.1": "claude-opus-4-1-20250805",

  // Opus 4 (legacy)
  "claude-opus-4": "claude-opus-4-20250514",
  "opus-4": "claude-opus-4-20250514",

  // Sonnet 4.6 (latest balanced performance)
  "claude-sonnet-4.6": MODEL_SONNET_4_6,
  "sonnet-4.6": MODEL_SONNET_4_6,
  sonnet: MODEL_SONNET_4_6, // Default to latest Sonnet

  // Sonnet 4.5 (previous balanced performance)
  "claude-sonnet-4.5": MODEL_SONNET_4_5,
  "sonnet-4.5": MODEL_SONNET_4_5,

  // Sonnet 4 (previous generation)
  "claude-sonnet-4": "claude-sonnet-4-20250514",
  "sonnet-4": "claude-sonnet-4-20250514",

  // Haiku 4.5 (newer fast model)
  "claude-haiku-4.5": MODEL_HAIKU_4_5,
  "haiku-4.5": MODEL_HAIKU_4_5,
  haiku: MODEL_HAIKU_4_5, // Default to latest Haiku

  // Haiku 3.5 (fast and cost-effective)
  "claude-haiku-3.5": "claude-haiku-3-5-20250929",
  "haiku-3.5": "claude-haiku-3-5-20250929",
} as const;

/**
 * Resolves a model alias to its full API model identifier.
 *
 * If the provided name is already a full model ID (e.g., "claude-opus-4-5-20251101"),
 * it is returned unchanged. Otherwise, the alias is looked up in `MODEL_ALIASES`.
 *
 * @param modelName - Model alias (e.g., "opus", "sonnet-4.5") or full model ID
 * @returns Full model ID suitable for API calls
 *
 * @example
 * ```typescript
 * resolveModelId("opus")           // "claude-opus-4-6"
 * resolveModelId("haiku-3.5")      // "claude-haiku-3-5-20250929"
 * resolveModelId("claude-sonnet-4-6") // unchanged
 * ```
 */
export function resolveModelId(modelName: string): string {
  return MODEL_ALIASES[modelName] ?? modelName;
}
