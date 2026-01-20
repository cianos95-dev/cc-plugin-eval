import { describe, expect, it, vi, beforeEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

import {
  callLLMForText,
  callLLMForMessage,
  callLLMForTextWithCost,
  type LLMCallOptions,
} from "../../../src/utils/llm.js";

// Mock the retry module to avoid actual retry delays
vi.mock("../../../src/utils/retry.js", () => ({
  withRetry: vi.fn((fn) => fn()),
}));

// Helper to create minimal mock response that satisfies runtime needs
const createMockResponse = (
  content: Array<{ type: string; text: string }>,
): Anthropic.Message =>
  ({
    id: "msg_123",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-5-20250929",
    content,
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  }) as unknown as Anthropic.Message;

describe("callLLMForText", () => {
  const createMockClient = (response: Anthropic.Message) => {
    return {
      messages: {
        create: vi.fn().mockResolvedValue(response),
      },
    } as unknown as Anthropic;
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
    const mockResponse = createMockResponse([
      { type: "text", text: "I am doing well, thank you!" },
    ]);

    const client = createMockClient(mockResponse);
    const result = await callLLMForText(client, defaultOptions);

    expect(result).toBe("I am doing well, thank you!");
  });

  it("passes correct parameters to the API", async () => {
    const mockResponse = createMockResponse([
      { type: "text", text: "Response" },
    ]);

    const client = createMockClient(mockResponse);
    await callLLMForText(client, defaultOptions);

    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 4096,
        temperature: 0.7,
        messages: [{ role: "user", content: "Hello, how are you?" }],
      }),
      { timeout: 60000 },
    );

    // Verify system prompt has cache_control
    const callArgs = vi.mocked(client.messages.create).mock.calls[0];
    const params = callArgs?.[0];
    expect(params?.system).toEqual([
      {
        type: "text",
        text: "You are a helpful assistant.",
        cache_control: { type: "ephemeral" },
      },
    ]);
  });

  it("throws error when no text content in response", async () => {
    const mockResponse = createMockResponse([]);

    const client = createMockClient(mockResponse);

    await expect(callLLMForText(client, defaultOptions)).rejects.toThrow(
      "No text content in LLM response",
    );
  });

  it("handles response with multiple content blocks, extracting first text", async () => {
    const mockResponse = createMockResponse([
      { type: "text", text: "First text block" },
      { type: "text", text: "Second text block" },
    ]);

    const client = createMockClient(mockResponse);
    const result = await callLLMForText(client, defaultOptions);

    expect(result).toBe("First text block");
  });
});

describe("callLLMForMessage", () => {
  const createMockClient = (response: Anthropic.Message) => {
    return {
      messages: {
        create: vi.fn().mockResolvedValue(response),
      },
    } as unknown as Anthropic;
  };

  const defaultOptions: LLMCallOptions = {
    model: "sonnet",
    maxTokens: 4096,
    temperature: 0.7,
    systemPrompt: "You are a helpful assistant.",
    userPrompt: "Hello",
    timeoutMs: 60000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns full message object", async () => {
    const mockResponse = createMockResponse([{ type: "text", text: "Hello!" }]);

    const client = createMockClient(mockResponse);
    const result = await callLLMForMessage(client, defaultOptions);

    expect(result).toEqual(mockResponse);
    expect(result.id).toBe("msg_123");
  });
});

describe("callLLMForTextWithCost", () => {
  // Helper to create mock response with full usage data
  const createMockResponseWithUsage = (
    text: string,
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    },
  ): Anthropic.Message =>
    ({
      id: "msg_123",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-5-20250929",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage,
    }) as unknown as Anthropic.Message;

  const createMockClient = (response: Anthropic.Message) => {
    return {
      messages: {
        create: vi.fn().mockResolvedValue(response),
      },
    } as unknown as Anthropic;
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
    const mockResponse = createMockResponseWithUsage("I am doing well!", {
      input_tokens: 100,
      output_tokens: 50,
    });

    const client = createMockClient(mockResponse);
    const result = await callLLMForTextWithCost(client, defaultOptions);

    expect(result.text).toBe("I am doing well!");
    expect(result.cost_usd).toBeGreaterThan(0);
    // Verify cost is calculated (sonnet: $3/1M input, $15/1M output)
    // Expected: (100/1M * 3) + (50/1M * 15) = 0.0003 + 0.00075 = 0.00105
    expect(result.cost_usd).toBeCloseTo(0.00105, 5);
  });

  it("calculates cost including cache tokens", async () => {
    const mockResponse = createMockResponseWithUsage("Response with caching", {
      input_tokens: 50,
      output_tokens: 25,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 200,
    });

    const client = createMockClient(mockResponse);
    const result = await callLLMForTextWithCost(client, defaultOptions);

    expect(result.text).toBe("Response with caching");
    // Cost includes cache creation ($3.75/1M) and cache read ($0.30/1M)
    expect(result.cost_usd).toBeGreaterThan(0);
  });

  it("throws error when no text content in response", async () => {
    const mockResponse = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-5-20250929",
      content: [],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 20 },
    } as unknown as Anthropic.Message;

    const client = createMockClient(mockResponse);

    await expect(
      callLLMForTextWithCost(client, defaultOptions),
    ).rejects.toThrow("No text content in LLM response");
  });

  it("handles zero output tokens", async () => {
    const mockResponse = createMockResponseWithUsage("", {
      input_tokens: 100,
      output_tokens: 0,
    });

    const client = createMockClient(mockResponse);
    const result = await callLLMForTextWithCost(client, defaultOptions);

    expect(result.text).toBe("");
    // Cost should only be input cost: 100/1M * 3 = 0.0003
    expect(result.cost_usd).toBeCloseTo(0.0003, 6);
  });
});
