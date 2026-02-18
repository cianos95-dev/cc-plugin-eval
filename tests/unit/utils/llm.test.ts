import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LLMProvider } from "../../../src/providers/types.js";

import {
  callLLMForText,
  callLLMForTextWithCost,
  type LLMCallOptions,
} from "../../../src/utils/llm.js";

// Mock the retry module to avoid actual retry delays
vi.mock("../../../src/utils/retry.js", () => ({
  withRetry: vi.fn((fn) => fn()),
}));

describe("callLLMForText", () => {
  const mockProvider: LLMProvider = {
    name: "test",
    supportsStructuredOutput: false,
    supportsPromptCaching: true,
    supportsBatchAPI: false,
    createCompletion: vi.fn(),
    createStructuredCompletion: vi.fn(),
  };

  const defaultOptions: LLMCallOptions = {
    model: "sonnet",
    maxTokens: 4096,
    temperature: 0.7,
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "Hello, how are you?",
    timeoutMs: 60000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns text content from successful response", async () => {
    vi.mocked(mockProvider.createCompletion).mockResolvedValue({
      text: "I am doing well, thank you!",
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    const result = await callLLMForText(mockProvider, defaultOptions);

    expect(result).toBe("I am doing well, thank you!");
  });

  it("passes correct parameters to the provider", async () => {
    vi.mocked(mockProvider.createCompletion).mockResolvedValue({
      text: "Response",
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    await callLLMForText(mockProvider, defaultOptions);

    expect(mockProvider.createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "sonnet",
        maxTokens: 4096,
        temperature: 0.7,
        systemPrompt: "You are a helpful assistant.",
        userPrompt: "Hello, how are you?",
        timeoutMs: 60000,
      }),
    );
  });

  it("throws error when no text content in response", async () => {
    vi.mocked(mockProvider.createCompletion).mockRejectedValue(
      new Error("No text content in LLM response"),
    );

    await expect(callLLMForText(mockProvider, defaultOptions)).rejects.toThrow(
      "No text content in LLM response",
    );
  });

  it("handles response with text content", async () => {
    vi.mocked(mockProvider.createCompletion).mockResolvedValue({
      text: "First text block",
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    const result = await callLLMForText(mockProvider, defaultOptions);

    expect(result).toBe("First text block");
  });
});

describe("callLLMForTextWithCost", () => {
  const mockProvider: LLMProvider = {
    name: "test",
    supportsStructuredOutput: false,
    supportsPromptCaching: true,
    supportsBatchAPI: false,
    createCompletion: vi.fn(),
    createStructuredCompletion: vi.fn(),
  };

  const defaultOptions: LLMCallOptions = {
    model: "sonnet",
    maxTokens: 4096,
    temperature: 0.7,
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "Hello, how are you?",
    timeoutMs: 60000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns text and calculated cost from successful response", async () => {
    vi.mocked(mockProvider.createCompletion).mockResolvedValue({
      text: "I am doing well!",
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await callLLMForTextWithCost(mockProvider, defaultOptions);

    expect(result.text).toBe("I am doing well!");
    expect(result.cost_usd).toBeGreaterThan(0);
    // Verify cost is calculated (sonnet: $3/1M input, $15/1M output)
    // Expected: (100/1M * 3) + (50/1M * 15) = 0.0003 + 0.00075 = 0.00105
    expect(result.cost_usd).toBeCloseTo(0.00105, 5);
  });

  it("calculates cost including cache tokens", async () => {
    vi.mocked(mockProvider.createCompletion).mockResolvedValue({
      text: "Response with caching",
      usage: {
        input_tokens: 50,
        output_tokens: 25,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 200,
      },
    });

    const result = await callLLMForTextWithCost(mockProvider, defaultOptions);

    expect(result.text).toBe("Response with caching");
    // Cost includes cache creation ($3.75/1M) and cache read ($0.30/1M)
    expect(result.cost_usd).toBeGreaterThan(0);
  });

  it("returns zero cost when provider does not support prompt caching", async () => {
    const noCacheProvider: LLMProvider = {
      name: "test-no-cache",
      supportsStructuredOutput: false,
      supportsPromptCaching: false,
      supportsBatchAPI: false,
      createCompletion: vi.fn(),
      createStructuredCompletion: vi.fn(),
    };

    vi.mocked(noCacheProvider.createCompletion).mockResolvedValue({
      text: "Response",
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await callLLMForTextWithCost(noCacheProvider, defaultOptions);

    expect(result.text).toBe("Response");
    expect(result.cost_usd).toBe(0);
  });

  it("throws error when provider throws", async () => {
    vi.mocked(mockProvider.createCompletion).mockRejectedValue(
      new Error("No text content in LLM response"),
    );

    await expect(
      callLLMForTextWithCost(mockProvider, defaultOptions),
    ).rejects.toThrow("No text content in LLM response");
  });

  it("handles zero output tokens", async () => {
    vi.mocked(mockProvider.createCompletion).mockResolvedValue({
      text: "",
      usage: { input_tokens: 100, output_tokens: 0 },
    });

    const result = await callLLMForTextWithCost(mockProvider, defaultOptions);

    expect(result.text).toBe("");
    // Cost should only be input cost: 100/1M * 3 = 0.0003
    expect(result.cost_usd).toBeCloseTo(0.0003, 6);
  });
});
