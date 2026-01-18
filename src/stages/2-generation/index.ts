/**
 * Stage 2: Scenario Generation
 *
 * Parses plugin structure and understands triggering conditions.
 */

import { writeJson } from "../../utils/file-io.js";
import { logger } from "../../utils/logging.js";

// Internal generators
import {
  generateAllAgentScenarios,
  createFallbackAgentScenarios,
} from "./agent-scenario-generator.js";
import { generateAllCommandScenarios } from "./command-scenario-generator.js";
import {
  estimatePipelineCost,
  createAnthropicClient,
  formatPipelineCostEstimate,
} from "./cost-estimator.js";
import { calculateDiversityMetrics } from "./diversity-manager.js";
import { generateAllHookScenarios } from "./hook-scenario-generator.js";
import { generateAllMcpScenarios } from "./mcp-scenario-generator.js";
import {
  generateAllSkillScenarios,
  createFallbackSkillScenarios,
} from "./skill-scenario-generator.js";

import type {
  AnalysisOutput,
  EvalConfig,
  TestScenario,
  PipelineCostEstimate,
  ScenarioType,
} from "../../types/index.js";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Output from Stage 2: Scenario Generation.
 */
export interface GenerationOutput {
  plugin_name: string;
  scenarios: TestScenario[];
  scenario_count_by_type: Record<ScenarioType, number>;
  scenario_count_by_component: Record<string, number>;
  cost_estimate: PipelineCostEstimate;
  diversity_metrics: {
    base_scenarios: number;
    total_with_variations: number;
    diversity_ratio: number;
  };
}

/**
 * Generation progress callback.
 */
export type GenerationProgressCallback = (
  stage:
    | "skills"
    | "agents"
    | "commands"
    | "hooks"
    | "mcp_servers"
    | "semantic",
  completed: number,
  total: number,
  current?: string,
) => void;

/**
 * Options for runGeneration to support dependency injection.
 */
export interface GenerationOptions {
  /** Anthropic client instance for LLM-based generation (injectable for testing) */
  client?: Anthropic;
  /** Progress callback for reporting generation progress */
  onProgress?: GenerationProgressCallback;
}

/**
 * Options for LLM-based component scenario generation.
 */
interface LLMComponentGenerationOptions<T> {
  /** Component type for logging */
  componentType: "skills" | "agents";
  /** Components to generate scenarios for */
  components: T[];
  /** LLM-based generator function */
  generator: (
    onProgress: (completed: number, total: number, current?: string) => void,
  ) => Promise<TestScenario[]>;
  /** Fallback generator for when LLM fails */
  createFallback: (component: T) => TestScenario[];
  /** Progress callback */
  onProgress?: GenerationProgressCallback | undefined;
}

/**
 * Generate scenarios for LLM-based components with fallback handling.
 *
 * Handles the common pattern of:
 * 1. Attempting LLM generation
 * 2. Falling back to deterministic scenarios on failure or empty results
 *
 * @param options - Generation options
 * @returns Generated scenarios
 */
async function generateLLMComponentScenarios<T>(
  options: LLMComponentGenerationOptions<T>,
): Promise<TestScenario[]> {
  const { componentType, components, generator, createFallback, onProgress } =
    options;

  logger.info(
    `Generating scenarios for ${String(components.length)} ${componentType}...`,
  );

  try {
    const scenarios = await generator((completed, total, current) => {
      onProgress?.(componentType, completed, total, current);
    });

    if (scenarios.length > 0) {
      logger.success(
        `Generated ${String(scenarios.length)} ${componentType} scenarios`,
      );
      return scenarios;
    }

    // Fall back to deterministic scenarios
    logger.warn("LLM generation failed, using fallback scenarios");
    return components.flatMap(createFallback);
  } catch (error) {
    logger.error(
      `${componentType.charAt(0).toUpperCase() + componentType.slice(1)} generation failed: ${String(error)}`,
    );
    // Fall back to deterministic scenarios
    return components.flatMap(createFallback);
  }
}

/**
 * Run Stage 2: Scenario Generation.
 *
 * @param analysis - Output from Stage 1
 * @param config - Evaluation configuration
 * @param options - Optional generation options including injectable client
 * @returns Generation output with scenarios
 */
export async function runGeneration(
  analysis: AnalysisOutput,
  config: EvalConfig,
  options?: GenerationOptions,
): Promise<GenerationOutput> {
  const { client: injectedClient, onProgress } = options ?? {};

  logger.stageHeader("Stage 2: Scenario Generation");

  // Estimate costs first
  const costEstimate = estimatePipelineCost(analysis, config);
  logger.info("Cost estimate:");
  console.log(formatPipelineCostEstimate(costEstimate));

  if (!costEstimate.within_budget && !config.dry_run) {
    logger.warn(
      `Estimated cost ($${costEstimate.total_estimated_cost_usd.toFixed(2)}) exceeds budget ($${config.execution.max_budget_usd.toFixed(2)})`,
    );
  }

  // If dry_run, just return estimate without generating
  if (config.dry_run) {
    logger.info("Dry-run mode: skipping scenario generation");
    return {
      plugin_name: analysis.plugin_name,
      scenarios: [],
      scenario_count_by_type: {
        direct: 0,
        paraphrased: 0,
        edge_case: 0,
        negative: 0,
        proactive: 0,
        semantic: 0,
      },
      scenario_count_by_component: {},
      cost_estimate: costEstimate,
      diversity_metrics: {
        base_scenarios: 0,
        total_with_variations: 0,
        diversity_ratio: 0,
      },
    };
  }

  const allScenarios: TestScenario[] = [];
  // Use injected client or create a new one
  const client = injectedClient ?? createAnthropicClient();

  // Generate skill scenarios (LLM-based)
  if (config.scope.skills && analysis.components.skills.length > 0) {
    const skillScenarios = await generateLLMComponentScenarios({
      componentType: "skills",
      components: analysis.components.skills,
      generator: async (onProgress) =>
        generateAllSkillScenarios(
          client,
          analysis.components.skills,
          config.generation,
          onProgress,
          config.max_concurrent,
        ),
      createFallback: createFallbackSkillScenarios,
      onProgress,
    });
    allScenarios.push(...skillScenarios);
  }

  // Generate agent scenarios (LLM-based)
  if (config.scope.agents && analysis.components.agents.length > 0) {
    const agentScenarios = await generateLLMComponentScenarios({
      componentType: "agents",
      components: analysis.components.agents,
      generator: async (onProgress) =>
        generateAllAgentScenarios(
          client,
          analysis.components.agents,
          config.generation,
          onProgress,
          config.max_concurrent,
        ),
      createFallback: createFallbackAgentScenarios,
      onProgress,
    });
    allScenarios.push(...agentScenarios);
  }

  // Generate command scenarios (deterministic - no LLM)
  if (config.scope.commands && analysis.components.commands.length > 0) {
    const commandScenarios = generateAllCommandScenarios(
      analysis.components.commands,
    );
    allScenarios.push(...commandScenarios);

    onProgress?.("commands", 1, 1);
  }

  // Generate hook scenarios (deterministic - no LLM)
  if (config.scope.hooks && analysis.components.hooks.length > 0) {
    const hookScenarios = generateAllHookScenarios(analysis.components.hooks);
    allScenarios.push(...hookScenarios);

    onProgress?.("hooks", 1, 1);
  }

  // Generate MCP server scenarios (deterministic - no LLM)
  if (config.scope.mcp_servers && analysis.components.mcp_servers.length > 0) {
    const mcpScenarios = generateAllMcpScenarios(
      analysis.components.mcp_servers,
    );
    allScenarios.push(...mcpScenarios);

    onProgress?.("mcp_servers", 1, 1);
  }

  // Calculate diversity metrics
  const metrics = calculateDiversityMetrics(allScenarios);

  logger.success(`\nTotal scenarios generated: ${String(allScenarios.length)}`);
  logger.info(`  Direct: ${String(metrics.by_type.direct)}`);
  logger.info(`  Paraphrased: ${String(metrics.by_type.paraphrased)}`);
  logger.info(`  Edge case: ${String(metrics.by_type.edge_case)}`);
  logger.info(`  Negative: ${String(metrics.by_type.negative)}`);
  logger.info(`  Proactive: ${String(metrics.by_type.proactive)}`);
  logger.info(`  Semantic: ${String(metrics.by_type.semantic)}`);

  return {
    plugin_name: analysis.plugin_name,
    scenarios: allScenarios,
    scenario_count_by_type: metrics.by_type,
    scenario_count_by_component: metrics.by_component,
    cost_estimate: costEstimate,
    diversity_metrics: {
      base_scenarios: metrics.base_scenarios,
      total_with_variations: metrics.variations,
      diversity_ratio: metrics.diversity_ratio,
    },
  };
}

/**
 * Generation metadata persisted to `generation-metadata.json`.
 *
 * This type represents the structure of metadata written to disk after
 * scenario generation. It can be used by consumers who need to read
 * and parse previously generated metadata files.
 *
 * @example
 * ```typescript
 * import { readJson } from "../utils/file-io.js";
 * import type { GenerationMetadata } from "./stages/2-generation/index.js";
 *
 * const metadata = readJson<GenerationMetadata>(
 *   `${resultsDir}/generation-metadata.json`
 * );
 * console.log(`Generated ${metadata.scenario_count} scenarios`);
 * ```
 */
export interface GenerationMetadata {
  timestamp: string;
  plugin_name: string;
  scenario_count: number;
  scenario_count_by_type: Record<ScenarioType, number>;
  scenario_count_by_component: Record<string, number>;
  diversity_metrics: GenerationOutput["diversity_metrics"];
  cost_estimate: PipelineCostEstimate;
}

/**
 * Writes generation metadata to the specified results directory.
 *
 * This helper centralizes the metadata writing logic that was previously
 * duplicated in the CLI's `run` and `generate` commands.
 *
 * @param resultsDir - Directory to write the metadata file to
 * @param generation - Generation output containing the metadata
 */
export function writeGenerationMetadata(
  resultsDir: string,
  generation: GenerationOutput,
): void {
  const metadata: GenerationMetadata = {
    timestamp: new Date().toISOString(),
    plugin_name: generation.plugin_name,
    scenario_count: generation.scenarios.length,
    scenario_count_by_type: generation.scenario_count_by_type,
    scenario_count_by_component: generation.scenario_count_by_component,
    diversity_metrics: generation.diversity_metrics,
    cost_estimate: generation.cost_estimate,
  };
  writeJson(`${resultsDir}/generation-metadata.json`, metadata);
}

// Re-export for convenience
export { generateAllCommandScenarios } from "./command-scenario-generator.js";

export {
  generateAllHookScenarios,
  getExpectedHookScenarioCount,
  getToolPrompt,
} from "./hook-scenario-generator.js";

export {
  generateAllMcpScenarios,
  getExpectedMcpScenarioCount,
  getMcpToolPrompt,
  generateMcpScenarios,
} from "./mcp-scenario-generator.js";

export {
  generateAllSkillScenarios,
  createFallbackSkillScenarios,
} from "./skill-scenario-generator.js";

export {
  generateAllAgentScenarios,
  createFallbackAgentScenarios,
} from "./agent-scenario-generator.js";

export {
  calculateScenarioDistribution,
  distributeScenarioTypes,
  calculateDiversityMetrics,
} from "./diversity-manager.js";

export {
  calculateOptimalBatchSize,
  createBatchConfig,
  TOKENS_PER_SCENARIO,
  THINKING_BUDGET,
} from "./batch-calculator.js";

export {
  estimatePipelineCost,
  estimateGenerationCost,
  estimateExecutionCost,
  estimateEvaluationCost,
  createAnthropicClient,
  formatPipelineCostEstimate,
  type SystemPrompt,
} from "./cost-estimator.js";

// Re-export from config for backward compatibility
export { resolveModelId } from "../../config/models.js";
