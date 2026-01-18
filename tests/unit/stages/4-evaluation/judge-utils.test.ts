/**
 * Tests for judge utility functions.
 *
 * Tests the shared parseJudgeResponse function used by both
 * the LLM judge and batch evaluator.
 */

import { describe, it, expect } from "vitest";

import { parseJudgeResponse } from "../../../../src/stages/4-evaluation/judge-utils.js";

describe("parseJudgeResponse", () => {
  describe("valid responses", () => {
    it("should parse a valid response without highlights", () => {
      const input = JSON.stringify({
        quality_score: 8,
        response_relevance: 9,
        trigger_accuracy: "correct",
        issues: [],
        summary: "Good response",
      });

      const result = parseJudgeResponse(input);

      expect(result).toEqual({
        quality_score: 8,
        response_relevance: 9,
        trigger_accuracy: "correct",
        issues: [],
        summary: "Good response",
      });
      expect(result.highlights).toBeUndefined();
    });

    it("should parse a valid response with highlights", () => {
      const input = JSON.stringify({
        quality_score: 7,
        response_relevance: 8,
        trigger_accuracy: "partial",
        issues: ["Minor formatting issue"],
        highlights: [
          {
            description: "Correctly identified the skill",
            message_id: "msg_123",
            quoted_text: "Using the skill...",
            position_start: 10,
            position_end: 25,
          },
        ],
        summary: "Partial success",
      });

      const result = parseJudgeResponse(input);

      expect(result.quality_score).toBe(7);
      expect(result.response_relevance).toBe(8);
      expect(result.trigger_accuracy).toBe("partial");
      expect(result.issues).toEqual(["Minor formatting issue"]);
      expect(result.summary).toBe("Partial success");
      expect(result.highlights).toHaveLength(1);
      expect(result.highlights?.[0]).toEqual({
        description: "Correctly identified the skill",
        citation: {
          message_id: "msg_123",
          quoted_text: "Using the skill...",
          position: [10, 25],
        },
      });
    });

    it("should parse a response with tool_call_id in highlights", () => {
      const input = JSON.stringify({
        quality_score: 9,
        response_relevance: 9,
        trigger_accuracy: "correct",
        issues: [],
        highlights: [
          {
            description: "Tool invoked correctly",
            message_id: "msg_456",
            quoted_text: "Calling tool...",
            position_start: 0,
            position_end: 15,
            tool_call_id: "tool_abc123",
          },
        ],
        summary: "Excellent response",
      });

      const result = parseJudgeResponse(input);

      expect(result.highlights?.[0]?.citation.tool_call_id).toBe("tool_abc123");
    });

    it("should default position values to 0 when not provided", () => {
      const input = JSON.stringify({
        quality_score: 6,
        response_relevance: 7,
        trigger_accuracy: "incorrect",
        issues: ["Failed to trigger"],
        highlights: [
          {
            description: "Missing trigger",
            message_id: "msg_789",
            quoted_text: "Some text",
          },
        ],
        summary: "Did not trigger correctly",
      });

      const result = parseJudgeResponse(input);

      expect(result.highlights?.[0]?.citation.position).toEqual([0, 0]);
    });

    it("should handle all three trigger_accuracy values", () => {
      const triggerValues = ["correct", "incorrect", "partial"] as const;

      for (const triggerAccuracy of triggerValues) {
        const input = JSON.stringify({
          quality_score: 5,
          response_relevance: 5,
          trigger_accuracy: triggerAccuracy,
          issues: [],
          summary: `Testing ${triggerAccuracy}`,
        });

        const result = parseJudgeResponse(input);
        expect(result.trigger_accuracy).toBe(triggerAccuracy);
      }
    });

    it("should handle multiple highlights", () => {
      const input = JSON.stringify({
        quality_score: 8,
        response_relevance: 8,
        trigger_accuracy: "correct",
        issues: [],
        highlights: [
          {
            description: "First highlight",
            message_id: "msg_1",
            quoted_text: "Text 1",
            position_start: 0,
            position_end: 10,
          },
          {
            description: "Second highlight",
            message_id: "msg_2",
            quoted_text: "Text 2",
            position_start: 20,
            position_end: 30,
            tool_call_id: "tool_1",
          },
        ],
        summary: "Multiple highlights",
      });

      const result = parseJudgeResponse(input);

      expect(result.highlights).toHaveLength(2);
      expect(result.highlights?.[0]?.citation.message_id).toBe("msg_1");
      expect(result.highlights?.[1]?.citation.message_id).toBe("msg_2");
      expect(result.highlights?.[1]?.citation.tool_call_id).toBe("tool_1");
    });

    it("should handle empty highlights array", () => {
      const input = JSON.stringify({
        quality_score: 7,
        response_relevance: 7,
        trigger_accuracy: "correct",
        issues: [],
        highlights: [],
        summary: "No highlights",
      });

      const result = parseJudgeResponse(input);

      expect(result.highlights).toEqual([]);
    });

    it("should handle multiple issues", () => {
      const input = JSON.stringify({
        quality_score: 4,
        response_relevance: 5,
        trigger_accuracy: "incorrect",
        issues: ["Issue 1", "Issue 2", "Issue 3"],
        summary: "Multiple problems",
      });

      const result = parseJudgeResponse(input);

      expect(result.issues).toEqual(["Issue 1", "Issue 2", "Issue 3"]);
    });
  });

  describe("error handling", () => {
    it("should throw on invalid JSON", () => {
      expect(() => parseJudgeResponse("not json")).toThrow();
    });

    it("should throw on missing required fields", () => {
      const input = JSON.stringify({
        quality_score: 5,
        // missing other required fields
      });

      expect(() => parseJudgeResponse(input)).toThrow();
    });

    it("should throw on invalid trigger_accuracy value", () => {
      const input = JSON.stringify({
        quality_score: 5,
        response_relevance: 5,
        trigger_accuracy: "invalid_value",
        issues: [],
        summary: "Test",
      });

      expect(() => parseJudgeResponse(input)).toThrow();
    });

    it("should throw on invalid quality_score type", () => {
      const input = JSON.stringify({
        quality_score: "not a number",
        response_relevance: 5,
        trigger_accuracy: "correct",
        issues: [],
        summary: "Test",
      });

      expect(() => parseJudgeResponse(input)).toThrow();
    });

    it("should throw on invalid issues type", () => {
      const input = JSON.stringify({
        quality_score: 5,
        response_relevance: 5,
        trigger_accuracy: "correct",
        issues: "not an array",
        summary: "Test",
      });

      expect(() => parseJudgeResponse(input)).toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle score values at boundaries", () => {
      const input = JSON.stringify({
        quality_score: 0,
        response_relevance: 10,
        trigger_accuracy: "correct",
        issues: [],
        summary: "Boundary test",
      });

      const result = parseJudgeResponse(input);

      expect(result.quality_score).toBe(0);
      expect(result.response_relevance).toBe(10);
    });

    it("should handle empty issues array", () => {
      const input = JSON.stringify({
        quality_score: 10,
        response_relevance: 10,
        trigger_accuracy: "correct",
        issues: [],
        summary: "Perfect score",
      });

      const result = parseJudgeResponse(input);

      expect(result.issues).toEqual([]);
    });

    it("should handle whitespace in text fields", () => {
      const input = JSON.stringify({
        quality_score: 7,
        response_relevance: 7,
        trigger_accuracy: "correct",
        issues: ["  Issue with whitespace  "],
        summary: "  Summary with whitespace  ",
      });

      const result = parseJudgeResponse(input);

      expect(result.issues[0]).toBe("  Issue with whitespace  ");
      expect(result.summary).toBe("  Summary with whitespace  ");
    });

    it("should handle unicode characters", () => {
      const input = JSON.stringify({
        quality_score: 8,
        response_relevance: 8,
        trigger_accuracy: "correct",
        issues: ["Issue with emoji 🎉"],
        highlights: [
          {
            description: "Unicode description 日本語",
            message_id: "msg_unicode",
            quoted_text: "Text with special chars: àéïõü",
            position_start: 0,
            position_end: 30,
          },
        ],
        summary: "Summary with unicode: 中文",
      });

      const result = parseJudgeResponse(input);

      expect(result.issues[0]).toBe("Issue with emoji 🎉");
      expect(result.highlights?.[0]?.description).toBe(
        "Unicode description 日本語",
      );
      expect(result.summary).toBe("Summary with unicode: 中文");
    });
  });
});
