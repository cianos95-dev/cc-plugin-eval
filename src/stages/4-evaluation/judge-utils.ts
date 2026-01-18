/**
 * Judge Utilities - Shared utilities for LLM judge evaluation.
 *
 * Contains common functionality used by both the real-time LLM judge
 * and the batch evaluator.
 */

import {
  JudgeResponseSchema,
  type Citation,
  type HighlightWithCitation,
  type JudgeResponse,
} from "../../types/index.js";

/**
 * Parse judge response from structured output or batch result text.
 *
 * Uses Zod validation after JSON parsing for additional runtime type safety.
 *
 * @param text - JSON text from structured output or batch result
 * @returns Parsed and validated judge response
 * @throws {Error} If JSON parsing fails or validation fails
 */
export function parseJudgeResponse(text: string): JudgeResponse {
  const parsed = JSON.parse(text) as {
    quality_score: number;
    response_relevance: number;
    trigger_accuracy: "correct" | "incorrect" | "partial";
    issues: string[];
    highlights?: {
      description: string;
      message_id: string;
      quoted_text: string;
      position_start?: number;
      position_end?: number;
      tool_call_id?: string;
    }[];
    summary: string;
  };

  // Transform highlights from API format to internal format
  const highlights = parsed.highlights?.map((h): HighlightWithCitation => {
    const citation: Citation = {
      message_id: h.message_id,
      quoted_text: h.quoted_text,
      position: [h.position_start ?? 0, h.position_end ?? 0] as [
        number,
        number,
      ],
    };
    if (h.tool_call_id !== undefined) {
      citation.tool_call_id = h.tool_call_id;
    }
    return { description: h.description, citation };
  });

  // Build result object (without highlights initially)
  const result: JudgeResponse = {
    quality_score: parsed.quality_score,
    response_relevance: parsed.response_relevance,
    trigger_accuracy: parsed.trigger_accuracy,
    issues: parsed.issues,
    summary: parsed.summary,
  };

  // Only add highlights if present (exactOptionalPropertyTypes requires this pattern)
  if (highlights !== undefined) {
    result.highlights = highlights;
  }

  // Validate with Zod schema for runtime type safety
  const validated = JudgeResponseSchema.parse(result);

  // Return with proper handling for exactOptionalPropertyTypes
  // Zod may return undefined for optional fields, but our interface expects absence
  const response: JudgeResponse = {
    quality_score: validated.quality_score,
    response_relevance: validated.response_relevance,
    trigger_accuracy: validated.trigger_accuracy,
    issues: validated.issues,
    summary: validated.summary,
  };

  // Transform highlights to remove undefined values from optional fields
  if (validated.highlights !== undefined) {
    response.highlights = validated.highlights.map(
      (h): HighlightWithCitation => {
        const citation: Citation = {
          message_id: h.citation.message_id,
          quoted_text: h.citation.quoted_text,
          position: h.citation.position,
        };
        if (h.citation.tool_call_id !== undefined) {
          citation.tool_call_id = h.citation.tool_call_id;
        }
        return { description: h.description, citation };
      },
    );
  }

  return response;
}
