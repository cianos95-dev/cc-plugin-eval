/**
 * Unit tests for agent-scenario-generator.ts
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  buildAgentPrompt,
  parseAgentScenarioResponse,
  createFallbackAgentScenarios,
  generateAgentScenarios,
  generateAllAgentScenarios,
} from "../../../../src/stages/2-generation/agent-scenario-generator.js";
import type {
  AgentComponent,
  GenerationConfig,
} from "../../../../src/types/index.js";
import type { LLMProvider } from "../../../../src/providers/types.js";

// Mock the retry utility to avoid delays in tests
vi.mock("../../../../src/utils/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

// Mock the logger utility
vi.mock("../../../../src/utils/logging.js", () => ({
  logger: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    progress: vi.fn(),
  },
}));

import { logger } from "../../../../src/utils/logging.js";

describe("buildAgentPrompt", () => {
  const agent: AgentComponent = {
    name: "code-reviewer",
    path: "/path/agent.md",
    description: "Reviews code for quality and best practices",
    model: "sonnet",
    tools: ["Read", "Grep", "Glob"],
    example_triggers: [
      {
        context: "After writing code",
        user_message: "Please review my changes",
        expected_response: "I will review your changes",
        commentary: "Direct review request",
      },
      {
        context: "PR review",
        user_message: "Review this PR for issues",
        expected_response: "Reviewing the PR",
        commentary: "PR context",
      },
    ],
  };

  it("should include agent name and description", () => {
    const prompt = buildAgentPrompt(agent, 10);

    expect(prompt).toContain("code-reviewer");
    expect(prompt).toContain("Reviews code for quality and best practices");
  });

  it("should include model", () => {
    const prompt = buildAgentPrompt(agent, 10);

    expect(prompt).toContain("sonnet");
  });

  it("should include tools when present", () => {
    const prompt = buildAgentPrompt(agent, 10);

    expect(prompt).toContain("Read");
    expect(prompt).toContain("Grep");
    expect(prompt).toContain("Glob");
  });

  it("should exclude tools section when empty", () => {
    const agentNoTools: AgentComponent = {
      ...agent,
      tools: undefined,
    };

    const prompt = buildAgentPrompt(agentNoTools, 10);

    expect(prompt).not.toContain("Available Tools");
  });

  it("should include example triggers when present", () => {
    const prompt = buildAgentPrompt(agent, 10);

    expect(prompt).toContain("After writing code");
    expect(prompt).toContain("Please review my changes");
    expect(prompt).toContain("PR review");
  });

  it("should exclude examples section when empty", () => {
    const agentNoExamples: AgentComponent = {
      ...agent,
      example_triggers: [],
    };

    const prompt = buildAgentPrompt(agentNoExamples, 10);

    expect(prompt).not.toContain("Example triggers");
  });

  it("should include scenario count", () => {
    const prompt = buildAgentPrompt(agent, 15);

    expect(prompt).toContain("15");
  });

  it("should include type distribution with proactive", () => {
    const prompt = buildAgentPrompt(agent, 10);

    expect(prompt).toContain("direct");
    expect(prompt).toContain("proactive");
  });
});

describe("parseAgentScenarioResponse", () => {
  const agent: AgentComponent = {
    name: "code-reviewer",
    path: "/path/agent.md",
    description: "Reviews code",
    model: "haiku",
    example_triggers: [],
  };

  it("should parse valid JSON response", () => {
    const response = `[
      {
        "user_prompt": "review my code please",
        "scenario_type": "direct",
        "expected_trigger": true,
        "reasoning": "Direct request for code review"
      }
    ]`;

    const scenarios = parseAgentScenarioResponse(response, agent);

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].user_prompt).toBe("review my code please");
    expect(scenarios[0].scenario_type).toBe("direct");
    expect(scenarios[0].expected_trigger).toBe(true);
  });

  it("should handle markdown code blocks", () => {
    const response = `\`\`\`json
[
  {
    "user_prompt": "check this code",
    "scenario_type": "paraphrased",
    "expected_trigger": true,
    "reasoning": "Paraphrased review request"
  }
]
\`\`\``;

    const scenarios = parseAgentScenarioResponse(response, agent);

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].scenario_type).toBe("paraphrased");
  });

  it("should set correct component metadata", () => {
    const response = `[
      {
        "user_prompt": "test",
        "scenario_type": "direct",
        "expected_trigger": true,
        "reasoning": "test"
      }
    ]`;

    const scenarios = parseAgentScenarioResponse(response, agent);

    expect(scenarios[0].component_ref).toBe("code-reviewer");
    expect(scenarios[0].component_type).toBe("agent");
    expect(scenarios[0].expected_component).toBe("code-reviewer");
  });

  it("should parse proactive scenarios with setup messages", () => {
    const response = `[
      {
        "user_prompt": "yes, please do that",
        "scenario_type": "proactive",
        "expected_trigger": true,
        "reasoning": "Proactive after code change context",
        "setup_messages": [
          {"role": "user", "content": "I just finished implementing the feature"},
          {"role": "assistant", "content": "Great! Would you like me to review it?"}
        ]
      }
    ]`;

    const scenarios = parseAgentScenarioResponse(response, agent);

    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].scenario_type).toBe("proactive");
    expect(scenarios[0].setup_messages).toBeDefined();
    expect(scenarios[0].setup_messages).toHaveLength(2);
    expect(scenarios[0].setup_messages?.[0].role).toBe("user");
  });

  it("should not include setup_messages for non-proactive scenarios", () => {
    const response = `[
      {
        "user_prompt": "review code",
        "scenario_type": "direct",
        "expected_trigger": true,
        "reasoning": "Direct request",
        "setup_messages": [{"role": "user", "content": "ignored"}]
      }
    ]`;

    const scenarios = parseAgentScenarioResponse(response, agent);

    // setup_messages should be ignored for non-proactive
    expect(scenarios[0].setup_messages).toBeUndefined();
  });

  it("should generate unique IDs", () => {
    const response = `[
      {
        "user_prompt": "test 1",
        "scenario_type": "direct",
        "expected_trigger": true,
        "reasoning": "test"
      },
      {
        "user_prompt": "test 2",
        "scenario_type": "direct",
        "expected_trigger": true,
        "reasoning": "test"
      }
    ]`;

    const scenarios = parseAgentScenarioResponse(response, agent);

    expect(scenarios[0].id).toBe("code-reviewer-direct-0");
    expect(scenarios[1].id).toBe("code-reviewer-direct-1");
  });

  it("should return empty array for invalid JSON", () => {
    const response = "Invalid JSON";
    const scenarios = parseAgentScenarioResponse(response, agent);

    expect(scenarios).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to parse LLM response for"),
      expect.any(SyntaxError),
    );
  });
});

describe("createFallbackAgentScenarios", () => {
  it("should create scenarios from example triggers", () => {
    const agent: AgentComponent = {
      name: "code-reviewer",
      path: "/path/agent.md",
      description: "Reviews code",
      model: "haiku",
      example_triggers: [
        {
          context: "After coding",
          user_message: "Review my changes",
          expected_response: "Reviewing",
          commentary: "Direct request",
        },
        {
          context: "PR review",
          user_message: "Check this PR",
          expected_response: "Checking",
          commentary: "PR context",
        },
      ],
    };

    const scenarios = createFallbackAgentScenarios(agent);

    const directScenarios = scenarios.filter(
      (s) => s.scenario_type === "direct",
    );
    expect(directScenarios).toHaveLength(2);
    expect(directScenarios[0].user_prompt).toBe("Review my changes");
    expect(directScenarios[1].user_prompt).toBe("Check this PR");
  });

  it("should create generic scenario when no examples", () => {
    const agent: AgentComponent = {
      name: "generic-agent",
      path: "/path/agent.md",
      description: "Does generic things for testing",
      model: "haiku",
      example_triggers: [],
    };

    const scenarios = createFallbackAgentScenarios(agent);

    const directScenarios = scenarios.filter(
      (s) => s.scenario_type === "direct",
    );
    expect(directScenarios).toHaveLength(1);
    expect(directScenarios[0].user_prompt).toContain("Help me with");
  });

  it("should include one negative scenario", () => {
    const agent: AgentComponent = {
      name: "test-agent",
      path: "/path/agent.md",
      description: "Test",
      model: "haiku",
      example_triggers: [],
    };

    const scenarios = createFallbackAgentScenarios(agent);

    const negativeScenarios = scenarios.filter(
      (s) => s.scenario_type === "negative",
    );
    expect(negativeScenarios).toHaveLength(1);
    expect(negativeScenarios[0].expected_trigger).toBe(false);
    expect(negativeScenarios[0].user_prompt).toBe(
      "What is the capital of France?",
    );
  });

  it("should set correct component metadata", () => {
    const agent: AgentComponent = {
      name: "my-agent",
      path: "/path/agent.md",
      description: "Test",
      model: "haiku",
      example_triggers: [
        {
          context: "test",
          user_message: "test",
          expected_response: "test",
          commentary: "test",
        },
      ],
    };

    const scenarios = createFallbackAgentScenarios(agent);

    for (const scenario of scenarios) {
      expect(scenario.component_ref).toBe("my-agent");
      expect(scenario.component_type).toBe("agent");
      expect(scenario.expected_component).toBe("my-agent");
    }
  });

  it("should generate fallback IDs", () => {
    const agent: AgentComponent = {
      name: "test-agent",
      path: "/path/agent.md",
      description: "Test",
      model: "haiku",
      example_triggers: [
        {
          context: "test",
          user_message: "test",
          expected_response: "test",
          commentary: "test",
        },
      ],
    };

    const scenarios = createFallbackAgentScenarios(agent);

    expect(scenarios[0].id).toContain("fallback");
  });

  it("should include context in reasoning", () => {
    const agent: AgentComponent = {
      name: "test-agent",
      path: "/path/agent.md",
      description: "Test",
      model: "haiku",
      example_triggers: [
        {
          context: "After debugging",
          user_message: "check it",
          expected_response: "checking",
          commentary: "debug context",
        },
      ],
    };

    const scenarios = createFallbackAgentScenarios(agent);

    const directScenario = scenarios.find((s) => s.scenario_type === "direct");
    expect(directScenario?.reasoning).toContain("After debugging");
  });
});

describe("generateAgentScenarios", () => {
  let mockProvider: LLMProvider;
  const agent: AgentComponent = {
    name: "code-reviewer",
    path: "/path/agent.md",
    description: "Reviews code for quality and best practices",
    model: "sonnet",
    tools: ["Read", "Grep", "Glob"],
    example_triggers: [
      {
        context: "After writing code",
        user_message: "Please review my changes",
        expected_response: "I will review your changes",
        commentary: "Direct review request",
      },
    ],
  };

  const config: GenerationConfig = {
    model: "haiku",
    scenarios_per_component: 5,
    diversity: 0.5,
    semantic_variations: false,
    api_timeout_ms: 60000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = {
      name: "test",
      supportsStructuredOutput: false,
      supportsPromptCaching: true,
      supportsBatchAPI: false,
      createCompletion: vi.fn(),
      createStructuredCompletion: vi.fn(),
    };
  });

  it("should generate scenarios from LLM response", async () => {
    (mockProvider.createCompletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify([
        {
          user_prompt: "review my code please",
          scenario_type: "direct",
          expected_trigger: true,
          reasoning: "Direct request for code review",
        },
        {
          user_prompt: "can you check this PR?",
          scenario_type: "paraphrased",
          expected_trigger: true,
          reasoning: "Paraphrased review request",
        },
      ]),
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await generateAgentScenarios(mockProvider, agent, config);

    expect(mockProvider.createCompletion).toHaveBeenCalledTimes(1);
    expect(mockProvider.createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "haiku",
        userPrompt: expect.stringContaining("code-reviewer"),
        timeoutMs: 60000,
      }),
    );
    expect(result.scenarios).toHaveLength(2);
    expect(result.scenarios[0].user_prompt).toBe("review my code please");
    expect(result.scenarios[0].component_type).toBe("agent");
    expect(result.cost_usd).toBeGreaterThan(0);
  });

  it("should handle proactive scenarios with setup_messages", async () => {
    (mockProvider.createCompletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify([
        {
          user_prompt: "yes, please do that",
          scenario_type: "proactive",
          expected_trigger: true,
          reasoning: "Proactive after code context",
          setup_messages: [
            { role: "user", content: "I just finished the feature" },
            {
              role: "assistant",
              content: "Would you like me to review it?",
            },
          ],
        },
      ]),
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await generateAgentScenarios(mockProvider, agent, config);

    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].scenario_type).toBe("proactive");
    expect(result.scenarios[0].setup_messages).toHaveLength(2);
    expect(result.scenarios[0].setup_messages?.[0].role).toBe("user");
  });

  it("should handle empty response gracefully", async () => {
    (mockProvider.createCompletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: "[]",
      usage: { input_tokens: 50, output_tokens: 10 },
    });

    const result = await generateAgentScenarios(mockProvider, agent, config);

    expect(result.scenarios).toEqual([]);
    expect(result.cost_usd).toBeGreaterThan(0);
  });

  it("should handle markdown-wrapped JSON response", async () => {
    (mockProvider.createCompletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: '```json\n[{"user_prompt": "test", "scenario_type": "direct", "expected_trigger": true, "reasoning": "test"}]\n```',
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await generateAgentScenarios(mockProvider, agent, config);

    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].user_prompt).toBe("test");
  });

  it("should use correct model from config", async () => {
    (mockProvider.createCompletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: "[]",
      usage: { input_tokens: 50, output_tokens: 10 },
    });

    const opusConfig = { ...config, model: "opus" };
    await generateAgentScenarios(mockProvider, agent, opusConfig);

    expect(mockProvider.createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "opus",
      }),
    );
  });

  it("should return cost based on token usage", async () => {
    (mockProvider.createCompletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: "[]",
      usage: { input_tokens: 1000, output_tokens: 500 },
    });

    const result = await generateAgentScenarios(mockProvider, agent, config);

    // Haiku 4.5: $1/1M input, $5/1M output
    // Expected: (1000/1M * 1) + (500/1M * 5) = 0.001 + 0.0025 = 0.0035
    expect(result.cost_usd).toBeCloseTo(0.0035, 6);
  });
});

describe("generateAllAgentScenarios", () => {
  let mockProvider: LLMProvider;
  const agents: AgentComponent[] = [
    {
      name: "agent-one",
      path: "/path/agent1.md",
      description: "First agent",
      model: "haiku",
      example_triggers: [],
    },
    {
      name: "agent-two",
      path: "/path/agent2.md",
      description: "Second agent",
      model: "haiku",
      example_triggers: [],
    },
  ];

  const config: GenerationConfig = {
    model: "haiku",
    scenarios_per_component: 3,
    diversity: 0.5,
    semantic_variations: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = {
      name: "test",
      supportsStructuredOutput: false,
      supportsPromptCaching: true,
      supportsBatchAPI: false,
      createCompletion: vi.fn(),
      createStructuredCompletion: vi.fn(),
    };
  });

  it("should generate scenarios for all agents", async () => {
    (mockProvider.createCompletion as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        text: JSON.stringify([
          {
            user_prompt: "agent one prompt",
            scenario_type: "direct",
            expected_trigger: true,
            reasoning: "test",
          },
        ]),
        usage: { input_tokens: 100, output_tokens: 50 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify([
          {
            user_prompt: "agent two prompt",
            scenario_type: "direct",
            expected_trigger: true,
            reasoning: "test",
          },
        ]),
        usage: { input_tokens: 100, output_tokens: 50 },
      });

    const result = await generateAllAgentScenarios({
      provider: mockProvider,
      agents,
      config,
    });

    expect(mockProvider.createCompletion).toHaveBeenCalledTimes(2);
    expect(result.scenarios).toHaveLength(2);
    expect(result.scenarios[0].component_ref).toBe("agent-one");
    expect(result.scenarios[1].component_ref).toBe("agent-two");
    expect(result.cost_usd).toBeGreaterThan(0);
  });

  it("should call progress callback", async () => {
    (mockProvider.createCompletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: "[]",
      usage: { input_tokens: 50, output_tokens: 10 },
    });

    const progressCallback = vi.fn();
    await generateAllAgentScenarios({
      provider: mockProvider,
      agents,
      config,
      onProgress: progressCallback,
    });

    // Called once per completed agent (parallel execution)
    expect(progressCallback).toHaveBeenCalledTimes(2);
    expect(progressCallback).toHaveBeenCalledWith(1, 2, "agent-one");
    expect(progressCallback).toHaveBeenCalledWith(2, 2, "agent-two");
  });

  it("should return empty result for empty agents list", async () => {
    const result = await generateAllAgentScenarios({
      provider: mockProvider,
      agents: [],
      config,
    });

    expect(result.scenarios).toEqual([]);
    expect(result.cost_usd).toBe(0);
    expect(mockProvider.createCompletion).not.toHaveBeenCalled();
  });

  it("should aggregate scenarios and costs from all agents", async () => {
    (mockProvider.createCompletion as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        text: JSON.stringify([
          {
            user_prompt: "p1",
            scenario_type: "direct",
            expected_trigger: true,
            reasoning: "r1",
          },
          {
            user_prompt: "p2",
            scenario_type: "proactive",
            expected_trigger: true,
            reasoning: "r2",
            setup_messages: [{ role: "user", content: "context" }],
          },
        ]),
        usage: { input_tokens: 100, output_tokens: 50 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify([
          {
            user_prompt: "p3",
            scenario_type: "negative",
            expected_trigger: false,
            reasoning: "r3",
          },
        ]),
        usage: { input_tokens: 100, output_tokens: 50 },
      });

    const result = await generateAllAgentScenarios({
      provider: mockProvider,
      agents,
      config,
    });

    expect(result.scenarios).toHaveLength(3);
    // Cost should be accumulated from both calls
    expect(result.cost_usd).toBeGreaterThan(0);
  });
});
