import { describe, expect, it, vi, beforeEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

import {
  callLLMForText,
  callLLMForMessage,
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
