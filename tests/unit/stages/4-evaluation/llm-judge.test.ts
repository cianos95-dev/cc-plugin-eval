/**
 * Tests for LLM judge functions.
 *
 * Uses mocked LLMProvider to test LLM integration paths.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import type {
  EvaluationConfig,
  ProgrammaticDetection,
  TestScenario,
  Transcript,
} from "../../../../src/types/index.js";

import type { LLMProvider } from "../../../../src/providers/types.js";

import {
  evaluateWithLLMJudge,
  evaluateWithFallback,
  buildJudgePrompt,
  formatTranscriptWithIds,
  createErrorJudgeResponse,
} from "../../../../src/stages/4-evaluation/llm-judge.js";

// Mock the retry utility to avoid delays in tests
vi.mock("../../../../src/utils/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

/**
 * Create a mock LLMProvider.
 * Mocks both createStructuredCompletion (for structured output) and createCompletion (for fallback).
 *
 * When supportsPromptCaching is true the provider returns real usage tokens so cost > 0.
 * When supportsPromptCaching is false calculateCostFromUsage is bypassed and cost = 0.
 */
function createMockProvider(
  responseText: string,
  { supportsPromptCaching = true }: { supportsPromptCaching?: boolean } = {},
): LLMProvider & {
  createStructuredCompletion: Mock;
  createCompletion: Mock;
} {
  const mockResponse = {
    text: responseText,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
  return {
    name: "mock-provider",
    supportsStructuredOutput: true,
    supportsPromptCaching,
    supportsBatchAPI: false,
    createStructuredCompletion: vi.fn().mockResolvedValue(mockResponse),
    createCompletion: vi.fn().mockResolvedValue(mockResponse),
  };
}

/**
 * Create a mock test scenario.
 */
function createScenario(overrides: Partial<TestScenario> = {}): TestScenario {
  return {
    id: "test-scenario-1",
    component_ref: "test-skill",
    component_type: "skill",
    scenario_type: "direct",
    user_prompt: "Help me commit my changes",
    expected_trigger: true,
    expected_component: "commit",
    ...overrides,
  };
}

/**
 * Create a mock transcript.
 */
function createTranscript(
  events: Transcript["events"] = [],
  pluginName = "test-plugin",
): Transcript {
  return {
    metadata: {
      version: "v3.0",
      plugin_name: pluginName,
      scenario_id: "test-scenario-1",
      timestamp: new Date().toISOString(),
      model: "claude-sonnet-4-20250514",
    },
    events:
      events.length > 0
        ? events
        : [
            {
              id: "msg-1",
              type: "user",
              edit: {
                message: { role: "user", content: "Help me commit my changes" },
              },
            },
            {
              id: "msg-2",
              type: "assistant",
              edit: {
                message: {
                  role: "assistant",
                  content: "I'll help you commit your changes.",
                  tool_calls: [
                    { id: "tc-1", name: "Skill", input: { skill: "commit" } },
                  ],
                },
              },
            },
          ],
  };
}

/**
 * Create mock programmatic detections.
 */
function createDetections(
  components: { name: string; type: "skill" | "agent" | "command" }[] = [],
): ProgrammaticDetection[] {
  return components.map((c) => ({
    component_type: c.type,
    component_name: c.name,
    confidence: 100 as const,
    tool_name:
      c.type === "skill"
        ? "Skill"
        : c.type === "agent"
          ? "Task"
          : "SlashCommand",
    evidence: `${c.type} triggered: ${c.name}`,
    timestamp: Date.now(),
  }));
}

/**
 * Create mock evaluation config.
 */
function createConfig(
  overrides: Partial<EvaluationConfig> = {},
): EvaluationConfig {
  return {
    model: "haiku",
    max_tokens: 1024,
    detection_mode: "programmatic_first",
    num_samples: 1,
    aggregate_method: "average",
    include_citations: true,
    ...overrides,
  };
}

/**
 * Create a valid judge response JSON string.
 */
function createJudgeResponseJson(
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    quality_score: 8,
    response_relevance: 9,
    trigger_accuracy: "correct",
    issues: [],
    highlights: [
      {
        description: "Component triggered correctly",
        message_id: "msg-2",
        quoted_text: "I'll help you commit",
        position_start: 0,
        position_end: 20,
      },
    ],
    summary: "The component triggered correctly and responded appropriately.",
    ...overrides,
  });
}

describe("formatTranscriptWithIds", () => {
  it("should format user events with message ID", () => {
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "user",
        edit: { message: { role: "user", content: "Hello world" } },
      },
    ]);

    const formatted = formatTranscriptWithIds(transcript);

    expect(formatted).toContain("[msg-1] USER:");
    expect(formatted).toContain("Hello world");
  });

  it("should format assistant events with tool info", () => {
    const transcript = createTranscript([
      {
        id: "msg-2",
        type: "assistant",
        edit: {
          message: {
            role: "assistant",
            content: "I'll help you",
            tool_calls: [
              { id: "tc-1", name: "Skill", input: { skill: "commit" } },
            ],
          },
        },
      },
    ]);

    const formatted = formatTranscriptWithIds(transcript);

    expect(formatted).toContain("[msg-2] ASSISTANT:");
    expect(formatted).toContain("I'll help you");
    expect(formatted).toContain("[Tools: Skill]");
  });

  it("should format tool_result events", () => {
    const transcript = createTranscript([
      {
        id: "msg-3",
        type: "tool_result",
        tool_use_id: "tc-1",
        result: "Success",
      },
    ]);

    const formatted = formatTranscriptWithIds(transcript);

    expect(formatted).toContain("[msg-3] TOOL_RESULT:");
    expect(formatted).toContain("Success");
  });

  it("should truncate long content", () => {
    const longContent = "x".repeat(600);
    const transcript = createTranscript([
      {
        id: "msg-1",
        type: "user",
        edit: { message: { role: "user", content: longContent } },
      },
    ]);

    const formatted = formatTranscriptWithIds(transcript, 500);

    expect(formatted.length).toBeLessThan(longContent.length + 50);
    expect(formatted).toContain("...");
  });

  it("should handle object results in tool_result", () => {
    const transcript = createTranscript([
      {
        id: "msg-3",
        type: "tool_result",
        tool_use_id: "tc-1",
        result: { status: "success", data: [1, 2, 3] },
      },
    ]);

    const formatted = formatTranscriptWithIds(transcript);

    expect(formatted).toContain("status");
    expect(formatted).toContain("success");
  });
});

describe("buildJudgePrompt", () => {
  it("should include all required fields", () => {
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([{ name: "commit", type: "skill" }]);
    const config = createConfig();

    const prompt = buildJudgePrompt(scenario, transcript, detections, config);

    expect(prompt).toContain("PLUGIN: test-plugin");
    expect(prompt).toContain("COMPONENT BEING TESTED: commit (skill)");
    expect(prompt).toContain("SCENARIO TYPE: direct");
    expect(prompt).toContain("EXPECTED TO TRIGGER: true");
    expect(prompt).toContain("PROGRAMMATIC DETECTION: skill:commit");
    expect(prompt).toContain("COMPONENT DETAILS:");
    expect(prompt).toContain("test-skill");
  });

  it("should show no components detected when empty", () => {
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections: ProgrammaticDetection[] = [];
    const config = createConfig();

    const prompt = buildJudgePrompt(scenario, transcript, detections, config);

    expect(prompt).toContain("PROGRAMMATIC DETECTION: No components detected");
  });

  it("should include citation instruction when enabled", () => {
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig({ include_citations: true });

    const prompt = buildJudgePrompt(scenario, transcript, detections, config);

    expect(prompt).toContain(
      "message_id and quoted_text for citation grounding",
    );
  });

  it("should use simple highlight instruction when citations disabled", () => {
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig({ include_citations: false });

    const prompt = buildJudgePrompt(scenario, transcript, detections, config);

    expect(prompt).toContain(
      "Include notable quotes demonstrating good or bad behavior",
    );
  });

  it("should include multiple detected components", () => {
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([
      { name: "commit", type: "skill" },
      { name: "review", type: "skill" },
    ]);
    const config = createConfig();

    const prompt = buildJudgePrompt(scenario, transcript, detections, config);

    expect(prompt).toContain("skill:commit, skill:review");
  });
});

describe("createErrorJudgeResponse", () => {
  it("should create response with error message", () => {
    const response = createErrorJudgeResponse("API connection failed");

    expect(response.quality_score).toBe(0);
    expect(response.response_relevance).toBe(0);
    expect(response.trigger_accuracy).toBe("incorrect");
    expect(response.issues).toContain("API connection failed");
    expect(response.summary).toContain("Evaluation failed");
    expect(response.summary).toContain("API connection failed");
  });

  it("should have no highlights", () => {
    const response = createErrorJudgeResponse("Error");

    expect(response.highlights).toBeUndefined();
  });
});

describe("evaluateWithLLMJudge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call provider.createStructuredCompletion with correct parameters", async () => {
    const responseJson = createJudgeResponseJson();
    const mockProvider = createMockProvider(responseJson);
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([{ name: "commit", type: "skill" }]);
    const config = createConfig({ model: "sonnet", max_tokens: 2048 });

    await evaluateWithLLMJudge({
      provider: mockProvider,
      scenario,
      transcript,
      programmaticResult: detections,
      config,
    });

    expect(mockProvider.createStructuredCompletion).toHaveBeenCalledTimes(1);
    const callArgs = mockProvider.createStructuredCompletion.mock
      .calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs).toBeDefined();
    expect(callArgs["model"]).toBe("sonnet");
    expect(callArgs["maxTokens"]).toBe(2048);
    expect(callArgs["schema"]).toEqual(expect.any(Object));
    expect(callArgs["systemPrompt"]).toEqual(expect.any(String));
    expect(callArgs["userPrompt"]).toEqual(expect.any(String));
  });

  it("should parse structured output response correctly", async () => {
    const responseJson = createJudgeResponseJson({
      quality_score: 9,
      response_relevance: 8,
      trigger_accuracy: "correct",
      issues: ["Minor formatting issue"],
      summary: "Good response overall",
    });
    const mockProvider = createMockProvider(responseJson);
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([{ name: "commit", type: "skill" }]);
    const config = createConfig();

    const result = await evaluateWithLLMJudge({
      provider: mockProvider,
      scenario,
      transcript,
      programmaticResult: detections,
      config,
    });

    expect(result.response.quality_score).toBe(9);
    expect(result.response.response_relevance).toBe(8);
    expect(result.response.trigger_accuracy).toBe("correct");
    expect(result.response.issues).toContain("Minor formatting issue");
    expect(result.response.summary).toBe("Good response overall");
    expect(result.cost_usd).toBeGreaterThan(0);
  });

  it("should transform highlights with citations", async () => {
    const responseJson = createJudgeResponseJson({
      highlights: [
        {
          description: "Good trigger",
          message_id: "msg-2",
          quoted_text: "I'll help you commit",
          position_start: 0,
          position_end: 20,
        },
      ],
    });
    const mockProvider = createMockProvider(responseJson);
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    const result = await evaluateWithLLMJudge({
      provider: mockProvider,
      scenario,
      transcript,
      programmaticResult: detections,
      config,
    });

    expect(result.response.highlights).toHaveLength(1);
    expect(result.response.highlights?.[0]?.description).toBe("Good trigger");
    expect(result.response.highlights?.[0]?.citation.message_id).toBe("msg-2");
    expect(result.response.highlights?.[0]?.citation.quoted_text).toBe(
      "I'll help you commit",
    );
    expect(result.response.highlights?.[0]?.citation.position).toEqual([0, 20]);
    expect(result.cost_usd).toBeGreaterThan(0);
  });

  it("should handle response without highlights", async () => {
    const responseJson = JSON.stringify({
      quality_score: 7,
      response_relevance: 7,
      trigger_accuracy: "partial",
      issues: [],
      summary: "Acceptable",
    });
    const mockProvider = createMockProvider(responseJson);
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    const result = await evaluateWithLLMJudge({
      provider: mockProvider,
      scenario,
      transcript,
      programmaticResult: detections,
      config,
    });

    expect(result.response.highlights).toBeUndefined();
    expect(result.cost_usd).toBeGreaterThan(0);
  });

  it("should throw on invalid JSON response", async () => {
    const mockProvider = createMockProvider("not valid json");
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    await expect(
      evaluateWithLLMJudge({
        provider: mockProvider,
        scenario,
        transcript,
        programmaticResult: detections,
        config,
      }),
    ).rejects.toThrow("Failed to parse structured output");
  });

  it("should throw on Zod validation failure (invalid quality_score)", async () => {
    // Valid JSON but quality_score > 10 violates Zod schema constraint
    const invalidResponse = JSON.stringify({
      quality_score: 15, // Exceeds max(10)
      response_relevance: 8,
      trigger_accuracy: "correct",
      issues: [],
      summary: "Test summary",
    });
    const mockProvider = createMockProvider(invalidResponse);
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    await expect(
      evaluateWithLLMJudge({
        provider: mockProvider,
        scenario,
        transcript,
        programmaticResult: detections,
        config,
      }),
    ).rejects.toThrow("Failed to parse structured output");
  });

  it("should throw on Zod validation failure (invalid trigger_accuracy)", async () => {
    // Valid JSON but trigger_accuracy not in enum violates Zod schema
    const invalidResponse = JSON.stringify({
      quality_score: 8,
      response_relevance: 8,
      trigger_accuracy: "invalid_value", // Not in enum
      issues: [],
      summary: "Test summary",
    });
    const mockProvider = createMockProvider(invalidResponse);
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    await expect(
      evaluateWithLLMJudge({
        provider: mockProvider,
        scenario,
        transcript,
        programmaticResult: detections,
        config,
      }),
    ).rejects.toThrow("Failed to parse structured output");
  });

  it("should throw when createStructuredCompletion returns unparseable text", async () => {
    const mockProvider = createMockProvider("");
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    await expect(
      evaluateWithLLMJudge({
        provider: mockProvider,
        scenario,
        transcript,
        programmaticResult: detections,
        config,
      }),
    ).rejects.toThrow("Failed to parse structured output");
  });

  it("should return zero cost when supportsPromptCaching is false", async () => {
    const responseJson = createJudgeResponseJson();
    const mockProvider = createMockProvider(responseJson, {
      supportsPromptCaching: false,
    });
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    const result = await evaluateWithLLMJudge({
      provider: mockProvider,
      scenario,
      transcript,
      programmaticResult: detections,
      config,
    });

    expect(result.cost_usd).toBe(0);
  });
});

describe("evaluateWithFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use structured output when it works", async () => {
    const responseJson = createJudgeResponseJson({ quality_score: 9 });
    const mockProvider = createMockProvider(responseJson);
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([{ name: "commit", type: "skill" }]);
    const config = createConfig();

    const result = await evaluateWithFallback({
      provider: mockProvider,
      scenario,
      transcript,
      programmaticResult: detections,
      config,
    });

    expect(result.response.quality_score).toBe(9);
    expect(result.cost_usd).toBeGreaterThan(0);
    expect(mockProvider.createStructuredCompletion).toHaveBeenCalledTimes(1);
  });

  it("should fallback to JSON parsing on structured output failure", async () => {
    // First call (structured output) fails, second call (fallback) succeeds
    const responseJson = createJudgeResponseJson({ quality_score: 7 });
    const createStructuredCompletionMock = vi
      .fn()
      .mockRejectedValue(new Error("Structured output not supported"));
    const createCompletionMock = vi.fn().mockResolvedValue({
      text: responseJson,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    });
    const mockProvider: LLMProvider & {
      createStructuredCompletion: Mock;
      createCompletion: Mock;
    } = {
      name: "mock-provider",
      supportsStructuredOutput: true,
      supportsPromptCaching: true,
      supportsBatchAPI: false,
      createStructuredCompletion: createStructuredCompletionMock,
      createCompletion: createCompletionMock,
    };
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    const result = await evaluateWithFallback({
      provider: mockProvider,
      scenario,
      transcript,
      programmaticResult: detections,
      config,
    });

    expect(result.response.quality_score).toBe(7);
    expect(result.cost_usd).toBeGreaterThan(0);
    expect(createStructuredCompletionMock).toHaveBeenCalledTimes(1);
    expect(createCompletionMock).toHaveBeenCalledTimes(1);
  });

  it("should handle markdown code blocks in fallback response", async () => {
    const responseJson = createJudgeResponseJson({ quality_score: 6 });
    const wrappedResponse = "```json\n" + responseJson + "\n```";
    const createStructuredCompletionMock = vi
      .fn()
      .mockRejectedValue(new Error("Structured output error"));
    const createCompletionMock = vi.fn().mockResolvedValue({
      text: wrappedResponse,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    });
    const mockProvider: LLMProvider & {
      createStructuredCompletion: Mock;
      createCompletion: Mock;
    } = {
      name: "mock-provider",
      supportsStructuredOutput: true,
      supportsPromptCaching: true,
      supportsBatchAPI: false,
      createStructuredCompletion: createStructuredCompletionMock,
      createCompletion: createCompletionMock,
    };
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    const result = await evaluateWithFallback({
      provider: mockProvider,
      scenario,
      transcript,
      programmaticResult: detections,
      config,
    });

    expect(result.response.quality_score).toBe(6);
    expect(result.cost_usd).toBeGreaterThan(0);
  });

  it("should return error response when both methods fail", async () => {
    const createStructuredCompletionMock = vi
      .fn()
      .mockRejectedValue(new Error("Structured output error"));
    const createCompletionMock = vi.fn().mockResolvedValue({
      // Fallback returns invalid JSON
      text: "This is not JSON at all",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    });
    const mockProvider: LLMProvider & {
      createStructuredCompletion: Mock;
      createCompletion: Mock;
    } = {
      name: "mock-provider",
      supportsStructuredOutput: true,
      supportsPromptCaching: true,
      supportsBatchAPI: false,
      createStructuredCompletion: createStructuredCompletionMock,
      createCompletion: createCompletionMock,
    };
    const scenario = createScenario();
    const transcript = createTranscript();
    const detections = createDetections([]);
    const config = createConfig();

    const result = await evaluateWithFallback({
      provider: mockProvider,
      scenario,
      transcript,
      programmaticResult: detections,
      config,
    });

    // Should return default error response, but with cost tracked
    expect(result.response.quality_score).toBe(1);
    expect(result.response.trigger_accuracy).toBe("incorrect");
    expect(
      result.response.issues.some((i) => i.includes("Failed to parse")),
    ).toBe(true);
    expect(result.response.summary).toContain("parsing error");
    expect(result.cost_usd).toBeGreaterThan(0); // Cost is still tracked for failed parses
  });
});
