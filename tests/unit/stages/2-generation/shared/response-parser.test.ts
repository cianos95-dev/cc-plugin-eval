import { describe, it, expect, vi, beforeEach } from "vitest";

import { extractJsonFromLLMResponse } from "../../../../../src/stages/2-generation/shared/response-parser.js";

// Mock the logger
vi.mock("../../../../../src/utils/logging.js", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("extractJsonFromLLMResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("bare JSON parsing", () => {
    it("parses valid JSON array", () => {
      const response = '[{"name": "test", "value": 42}]';
      const result = extractJsonFromLLMResponse(response);

      expect(result).toEqual([{ name: "test", value: 42 }]);
    });

    it("parses valid JSON object", () => {
      const response = '{"key": "value"}';
      const result = extractJsonFromLLMResponse(response);

      expect(result).toEqual({ key: "value" });
    });

    it("trims whitespace before parsing", () => {
      const response = '  \n  {"key": "value"}  \n  ';
      const result = extractJsonFromLLMResponse(response);

      expect(result).toEqual({ key: "value" });
    });
  });

  describe("markdown code block extraction", () => {
    it("extracts JSON from ```json code block", () => {
      const response = `Here's the result:
\`\`\`json
[{"id": 1}, {"id": 2}]
\`\`\`
That's all.`;
      const result = extractJsonFromLLMResponse(response);

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("extracts JSON from ``` code block without language specifier", () => {
      const response = `Result:
\`\`\`
{"status": "ok"}
\`\`\``;
      const result = extractJsonFromLLMResponse(response);

      expect(result).toEqual({ status: "ok" });
    });

    it("handles code block with extra whitespace", () => {
      const response = `\`\`\`json
  { "trimmed": true }
\`\`\``;
      const result = extractJsonFromLLMResponse(response);

      expect(result).toEqual({ trimmed: true });
    });

    it("handles multiline JSON in code block", () => {
      const response = `\`\`\`json
{
  "multiline": true,
  "nested": {
    "data": [1, 2, 3]
  }
}
\`\`\``;
      const result = extractJsonFromLLMResponse(response);

      expect(result).toEqual({
        multiline: true,
        nested: { data: [1, 2, 3] },
      });
    });
  });

  describe("error handling", () => {
    it("returns null for invalid JSON", () => {
      const response = "not valid json";
      const result = extractJsonFromLLMResponse(response);

      expect(result).toBeNull();
    });

    it("returns null for malformed JSON", () => {
      const response = '{"unclosed": ';
      const result = extractJsonFromLLMResponse(response);

      expect(result).toBeNull();
    });

    it("logs error with component name when provided", async () => {
      const { logger } = await import("../../../../../src/utils/logging.js");

      const response = "invalid json";
      extractJsonFromLLMResponse(response, "test-component");

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to parse LLM response for test-component:",
        expect.any(Error),
      );
    });

    it("does not log when component name is not provided", async () => {
      const { logger } = await import("../../../../../src/utils/logging.js");

      const response = "invalid json";
      extractJsonFromLLMResponse(response);

      expect(logger.error).not.toHaveBeenCalled();
    });

    it("returns null for empty string", () => {
      const result = extractJsonFromLLMResponse("");

      expect(result).toBeNull();
    });

    it("returns null for whitespace only", () => {
      const result = extractJsonFromLLMResponse("   \n  ");

      expect(result).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles JSON with unicode characters", () => {
      const response = '{"message": "Hello, 世界! 🌍"}';
      const result = extractJsonFromLLMResponse(response);

      expect(result).toEqual({ message: "Hello, 世界! 🌍" });
    });

    it("handles JSON with escaped characters", () => {
      const response = '{"path": "C:\\\\Users\\\\test"}';
      const result = extractJsonFromLLMResponse(response);

      expect(result).toEqual({ path: "C:\\Users\\test" });
    });

    it("takes first code block when multiple exist", () => {
      const response = `\`\`\`json
{"first": true}
\`\`\`
Some text
\`\`\`json
{"second": true}
\`\`\``;
      const result = extractJsonFromLLMResponse(response);

      expect(result).toEqual({ first: true });
    });

    it("handles empty array", () => {
      const response = "[]";
      const result = extractJsonFromLLMResponse(response);

      expect(result).toEqual([]);
    });

    it("handles null value", () => {
      const response = "null";
      const result = extractJsonFromLLMResponse(response);

      expect(result).toBeNull();
    });
  });
});
