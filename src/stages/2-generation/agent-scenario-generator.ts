/**
 * Agent Scenario Generator - LLM-based scenario generation for agents.
 *
 * Agents can be triggered by:
 * 1. Direct request matching their description
 * 2. Task context that requires their specialized capability
 * 3. Proactive triggering based on prior conversation context
 *
 * Scenario types generated:
 * 1. Direct trigger (task matching agent's purpose)
 * 2. Paraphrased trigger (same need, different wording)
 * 3. Edge case trigger (unusual but valid use case)
 * 4. Negative control (should NOT trigger this agent)
 * 5. Proactive scenarios (context-based triggering)
 */

import { parallel } from "../../utils/concurrency.js";
import { callLLMForText } from "../../utils/llm.js";
import { logger } from "../../utils/logging.js";

import { distributeScenarioTypes } from "./diversity-manager.js";
import {
  extractJsonFromLLMResponse,
  setupRateLimiter,
} from "./shared/index.js";

import type {
  AgentComponent,
  TestScenario,
  ScenarioType,
  SetupMessage,
  GenerationConfig,
} from "../../types/index.js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Schema for LLM-generated agent scenario.
 */
interface GeneratedAgentScenario {
  user_prompt: string;
  scenario_type: ScenarioType;
  expected_trigger: boolean;
  reasoning: string;
  setup_messages?: SetupMessage[];
}

/**
 * Result from finding template block boundaries.
 */
interface TemplateBlockBoundaries {
  openIndex: number;
  closeIndex: number;
  openTag: string;
  closeTag: string;
}

/**
 * Find the boundaries of a template block in a string.
 *
 * @remarks
 * This function does not support nested blocks. For input like
 * `"{{#if a}}outer{{#if b}}inner{{/if}}{{/if}}"`, it will incorrectly
 * match the first `{{/if}}`. This is acceptable for the current use case
 * where template blocks in AGENT_USER_PROMPT_TEMPLATE are not nested.
 *
 * @param text - The string to search
 * @param blockName - The block name (e.g., "tools" for "{{#if tools}}")
 * @returns The boundaries if found, or null if not found
 */
function findTemplateBlockBoundaries(
  text: string,
  blockName: string,
): TemplateBlockBoundaries | null {
  const openTag = `{{#if ${blockName}}}`;
  const closeTag = "{{/if}}";

  const openIndex = text.indexOf(openTag);
  if (openIndex === -1) {
    return null;
  }

  const closeIndex = text.indexOf(closeTag, openIndex + openTag.length);
  if (closeIndex === -1) {
    return null;
  }

  return { openIndex, closeIndex, openTag, closeTag };
}

/**
 * Remove a template block from a string using string operations.
 *
 * Finds the opening tag (e.g., "{{#if tools}}") and its matching closing tag
 * ("{{/if}}") and removes everything between them, inclusive.
 *
 * @param text - The string to process
 * @param blockName - The block name (e.g., "tools" for "{{#if tools}}")
 * @returns The string with the block removed, or the original string if not found
 */
function removeTemplateBlock(text: string, blockName: string): string {
  const boundaries = findTemplateBlockBoundaries(text, blockName);
  if (!boundaries) {
    return text;
  }

  return (
    text.slice(0, boundaries.openIndex) +
    text.slice(boundaries.closeIndex + boundaries.closeTag.length)
  );
}

/**
 * Unwrap a template block, keeping its content but removing the tags.
 *
 * Finds the opening tag (e.g., "{{#if tools}}") and its matching closing tag
 * ("{{/if}}") and removes only the tags, keeping the content between them.
 *
 * @param text - The string to process
 * @param blockName - The block name (e.g., "tools" for "{{#if tools}}")
 * @returns The string with tags removed but content preserved
 */
function unwrapTemplateBlock(text: string, blockName: string): string {
  const boundaries = findTemplateBlockBoundaries(text, blockName);
  if (!boundaries) {
    return text;
  }

  const content = text.slice(
    boundaries.openIndex + boundaries.openTag.length,
    boundaries.closeIndex,
  );
  return (
    text.slice(0, boundaries.openIndex) +
    content +
    text.slice(boundaries.closeIndex + boundaries.closeTag.length)
  );
}

/**
 * Cacheable system instructions for agent scenario generation.
 *
 * These instructions are reused across all agents and benefit from
 * Anthropic's prompt caching (90% cost reduction after first call).
 */
const AGENT_SCENARIO_SYSTEM_PROMPT = `You generate test scenarios for Claude Code agent triggering evaluation.

For each scenario, provide a JSON object with:
- user_prompt: What the user would type to trigger this agent
- scenario_type: "direct" | "paraphrased" | "edge_case" | "negative" | "proactive"
- expected_trigger: true if this should trigger the agent, false otherwise
- reasoning: Brief explanation of why this tests the agent
- setup_messages: (for proactive only) array of prior messages to establish context
  Each setup message has: { "role": "user" | "assistant", "content": "..." }

IMPORTANT:
- Direct scenarios clearly match the agent's described purpose
- Paraphrased scenarios express the same need differently
- Edge case scenarios are unusual but valid use cases
- Negative scenarios should NOT trigger this agent (they might trigger a different one)
- Proactive scenarios include setup_messages to establish prior context

Output ONLY a JSON array of scenario objects. No markdown, no explanation.`;

/**
 * User prompt template for agent scenario generation (variable data only).
 */
const AGENT_USER_PROMPT_TEMPLATE = `Generate test scenarios for this Claude Code agent:

Name: {{agent_name}}
Description: {{description}}
Model: {{model}}
{{#if tools}}Available Tools: {{tools}}{{/if}}
{{#if examples}}
Example triggers:
{{examples}}
{{/if}}

Generate exactly {{scenario_count}} test scenarios distributed as follows:
{{type_distribution}}`;

/**
 * Build user prompt for agent scenario generation.
 *
 * Returns only the variable data (agent details) - the static instructions
 * are in AGENT_SCENARIO_SYSTEM_PROMPT for caching.
 *
 * @param agent - Agent component
 * @param scenarioCount - Total scenarios to generate
 * @returns User prompt string with variable data
 */
export function buildAgentPrompt(
  agent: AgentComponent,
  scenarioCount: number,
): string {
  // Distribute with proactive scenarios (agents can be proactively triggered)
  const distribution = distributeScenarioTypes(scenarioCount, true, false);

  // Replace one edge_case with proactive if available
  const edgeCaseCount = distribution.get("edge_case") ?? 0;
  if (edgeCaseCount > 0) {
    distribution.set("edge_case", edgeCaseCount - 1);
    distribution.set("proactive", 1);
  }

  const typeDistribution = Array.from(distribution.entries())
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `- ${String(count)} ${type} scenarios`)
    .join("\n");

  // Format examples
  const examples = agent.example_triggers
    .map((ex) => `  - Context: ${ex.context}\n    User: "${ex.user_message}"`)
    .join("\n");

  let prompt = AGENT_USER_PROMPT_TEMPLATE.replace("{{agent_name}}", agent.name)
    .replace("{{description}}", agent.description)
    .replace("{{model}}", agent.model)
    .replace("{{scenario_count}}", scenarioCount.toString())
    .replace("{{type_distribution}}", typeDistribution);

  // Handle optional fields
  if (agent.tools && agent.tools.length > 0) {
    prompt = unwrapTemplateBlock(prompt, "tools");
    prompt = prompt.replace("{{tools}}", agent.tools.join(", "));
  } else {
    prompt = removeTemplateBlock(prompt, "tools");
  }

  if (agent.example_triggers.length > 0) {
    prompt = unwrapTemplateBlock(prompt, "examples");
    prompt = prompt.replace("{{examples}}", examples);
  } else {
    prompt = removeTemplateBlock(prompt, "examples");
  }

  return prompt;
}

/**
 * Parse LLM response to extract agent scenarios.
 *
 * @param response - Raw LLM response text
 * @param agent - Agent component for reference
 * @returns Array of test scenarios
 */
export function parseAgentScenarioResponse(
  response: string,
  agent: AgentComponent,
): TestScenario[] {
  const generated = extractJsonFromLLMResponse(response, agent.name) as
    | GeneratedAgentScenario[]
    | null;

  if (!generated) {
    return [];
  }

  return generated.map((g, i) => {
    const scenario: TestScenario = {
      id: `${agent.name}-${g.scenario_type}-${String(i)}`,
      component_ref: agent.name,
      component_type: "agent",
      scenario_type: g.scenario_type,
      user_prompt: g.user_prompt,
      expected_trigger: g.expected_trigger,
      expected_component: agent.name,
      reasoning: g.reasoning,
    };

    // Add setup messages for proactive scenarios
    if (g.scenario_type === "proactive" && g.setup_messages) {
      scenario.setup_messages = g.setup_messages;
    }

    return scenario;
  });
}

/**
 * Generate scenarios for a single agent using LLM.
 *
 * Uses Anthropic's prompt caching for the system instructions to reduce
 * input token costs by ~90% after the first call within the cache TTL.
 *
 * @param client - Anthropic client
 * @param agent - Agent component
 * @param config - Generation config
 * @returns Array of test scenarios
 */
export async function generateAgentScenarios(
  client: Anthropic,
  agent: AgentComponent,
  config: GenerationConfig,
): Promise<TestScenario[]> {
  const userPrompt = buildAgentPrompt(agent, config.scenarios_per_component);

  const response = await callLLMForText(client, {
    model: config.model,
    maxTokens: config.max_tokens,
    temperature: config.temperature,
    systemPrompt: AGENT_SCENARIO_SYSTEM_PROMPT,
    userPrompt,
    timeoutMs: config.api_timeout_ms,
  });

  return parseAgentScenarioResponse(response, agent);
}

/**
 * Generate scenarios for all agents.
 *
 * Uses parallel execution with optional rate limiting.
 *
 * @param client - Anthropic client
 * @param agents - Array of agent components
 * @param config - Generation config
 * @param onProgress - Optional progress callback
 * @param maxConcurrent - Maximum concurrent LLM calls (defaults to 10)
 * @returns Array of all test scenarios
 */
export async function generateAllAgentScenarios(
  client: Anthropic,
  agents: AgentComponent[],
  config: GenerationConfig,
  onProgress?: (completed: number, total: number, agent: string) => void,
  maxConcurrent = 10,
): Promise<TestScenario[]> {
  // Create rate limiter if configured
  const rateLimiter = setupRateLimiter(config);

  let completedCount = 0;
  const result = await parallel({
    items: agents,
    concurrency: maxConcurrent,
    fn: async (agent) => {
      const generateFn = async (): Promise<TestScenario[]> =>
        generateAgentScenarios(client, agent, config);

      return rateLimiter ? rateLimiter(generateFn) : generateFn();
    },
    onComplete: (scenarios, _index, _total) => {
      completedCount++;
      const agentName = agents[_index]?.name ?? "unknown";
      onProgress?.(completedCount, agents.length, agentName);
      logger.progress(
        completedCount,
        agents.length,
        `Generated ${String(scenarios.length)} scenarios for ${agentName}`,
      );
    },
    onError: (error, agent) => {
      logger.error(
        `Failed to generate scenarios for agent ${agent.name}:`,
        error,
      );
    },
  });

  return result.results.flat();
}

/**
 * Create fallback scenarios when LLM generation fails.
 *
 * @param agent - Agent component
 * @returns Array of fallback test scenarios
 */
export function createFallbackAgentScenarios(
  agent: AgentComponent,
): TestScenario[] {
  const scenarios: TestScenario[] = [];

  // Create direct scenarios from examples
  for (const [i, example] of agent.example_triggers.entries()) {
    scenarios.push({
      id: `${agent.name}-fallback-direct-${String(i)}`,
      component_ref: agent.name,
      component_type: "agent",
      scenario_type: "direct",
      user_prompt: example.user_message,
      expected_trigger: true,
      expected_component: agent.name,
      reasoning: `Fallback: direct use of example - ${example.context}`,
    });
  }

  // If no examples, create a generic scenario from description
  if (scenarios.length === 0) {
    scenarios.push({
      id: `${agent.name}-fallback-direct-0`,
      component_ref: agent.name,
      component_type: "agent",
      scenario_type: "direct",
      user_prompt: `Help me with ${agent.description.toLowerCase().slice(0, 50)}`,
      expected_trigger: true,
      expected_component: agent.name,
      reasoning: "Fallback: generic request based on description",
    });
  }

  // Add one negative scenario
  scenarios.push({
    id: `${agent.name}-fallback-negative-0`,
    component_ref: agent.name,
    component_type: "agent",
    scenario_type: "negative",
    user_prompt: "What is the capital of France?",
    expected_trigger: false,
    expected_component: agent.name,
    reasoning: "Fallback: unrelated query should not trigger",
  });

  return scenarios;
}
