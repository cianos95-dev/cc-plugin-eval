/**
 * Shared utilities for parsing LLM responses in scenario generation.
 */
import { logger } from "../../../utils/logging.js";

/**
 * Extracts and parses JSON from an LLM response that may be wrapped in markdown code blocks.
 *
 * LLM responses often wrap JSON in markdown code blocks like:
 * ```json
 * [...]
 * ```
 *
 * This function handles both bare JSON and markdown-wrapped JSON.
 *
 * @param response - The raw LLM response text
 * @param componentName - Optional name for error logging (e.g., skill or agent name)
 * @returns The parsed JSON object, or null if parsing fails
 */
export function extractJsonFromLLMResponse(
  response: string,
  componentName?: string,
): unknown {
  try {
    let jsonText = response.trim();

    // Handle markdown code blocks (```json ... ``` or ``` ... ```)
    const jsonMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(jsonText);
    if (jsonMatch?.[1]) {
      jsonText = jsonMatch[1].trim();
    }

    return JSON.parse(jsonText) as unknown;
  } catch (error) {
    if (componentName) {
      logger.error(`Failed to parse LLM response for ${componentName}:`, error);
    }
    return null;
  }
}
