/**
 * Diversity Manager - Controls the ratio of unique base scenarios to variations.
 *
 * Diversity controls how scenarios are distributed:
 * - Higher diversity = more unique base scenarios, fewer variations each
 * - Lower diversity = fewer base scenarios, more variations each
 *
 * Formula (from Bloom):
 *   base_scenarios = total_scenarios × diversity
 *   variations_per_base = 1 / diversity
 *
 * Examples:
 *   diversity=0.2, total=10 → 2 base scenarios × 5 variations each
 *   diversity=0.5, total=10 → 5 base scenarios × 2 variations each
 *   diversity=1.0, total=10 → 10 unique scenarios, no variations
 */

import type {
  DiversityConfig,
  ScenarioDistribution,
  BaseScenario,
  TestScenario,
  ComponentType,
  ScenarioType,
} from "../../types/index.js";

/**
 * Minimum allowed diversity score.
 * Prevents extreme concentration (all variations from one base).
 */
const MIN_DIVERSITY_SCORE = 0.1;

/**
 * Maximum allowed diversity score.
 * At 1.0, every scenario is unique (no variations).
 */
const MAX_DIVERSITY_SCORE = 1.0;

/**
 * Calculate scenario distribution based on diversity config.
 *
 * @param config - Diversity configuration
 * @returns Distribution of base scenarios and variations
 */
export function calculateScenarioDistribution(
  config: DiversityConfig,
): ScenarioDistribution {
  const diversity = Math.max(
    MIN_DIVERSITY_SCORE,
    Math.min(MAX_DIVERSITY_SCORE, config.diversity),
  );
  const baseCount = Math.max(1, Math.ceil(config.total_scenarios * diversity));
  const variationsPerBase = Math.max(1, Math.ceil(1 / diversity));

  return {
    base_count: baseCount,
    variations_per_base: variationsPerBase,
  };
}

/**
 * Options for createBaseScenario.
 */
export interface CreateBaseScenarioOptions {
  /** Component reference (name) */
  componentRef: string;
  /** Type of component */
  componentType: ComponentType;
  /** The triggering mechanism to preserve */
  coreIntent: string;
  /** Original prompt */
  basePrompt: string;
  /** Index for ID generation */
  index: number;
}

/**
 * Create a base scenario from a component.
 *
 * @param options - Create base scenario options
 * @returns Base scenario
 */
export function createBaseScenario(
  options: CreateBaseScenarioOptions,
): BaseScenario {
  const { componentRef, componentType, coreIntent, basePrompt, index } =
    options;
  return {
    id: `${componentRef}-base-${String(index)}`,
    component_ref: componentRef,
    component_type: componentType,
    core_intent: coreIntent,
    base_prompt: basePrompt,
  };
}

/**
 * Convert a base scenario to a test scenario.
 *
 * @param base - Base scenario
 * @param scenarioType - Type of test scenario
 * @param expectedTrigger - Whether this should trigger
 * @param reasoning - Reasoning for this scenario
 * @returns Test scenario
 */
export function baseToTestScenario(
  base: BaseScenario,
  scenarioType: ScenarioType,
  expectedTrigger: boolean,
  reasoning?: string,
): TestScenario {
  const scenario: TestScenario = {
    id: base.id,
    component_ref: base.component_ref,
    component_type: base.component_type,
    scenario_type: scenarioType,
    user_prompt: base.base_prompt,
    expected_trigger: expectedTrigger,
    expected_component: base.component_ref,
  };

  if (reasoning !== undefined) {
    scenario.reasoning = reasoning;
  }

  return scenario;
}

/**
 * Distribute scenario types across a count.
 *
 * Given a total count, distribute across scenario types with priorities:
 * 1. Direct (highest priority - most important)
 * 2. Semantic (for skills with semantic matching)
 * 3. Paraphrased (test flexibility)
 * 4. Edge case (test robustness)
 * 5. Negative (test specificity)
 *
 * @param count - Total scenarios to distribute
 * @param includeNegative - Whether to include negative scenarios
 * @param includeSemantic - Whether to include semantic scenarios
 * @returns Distribution map
 */
/** Build scenario type list based on inclusion flags */
function buildScenarioTypeList(
  includeSemantic: boolean,
  includeNegative: boolean,
): ScenarioType[] {
  const types: ScenarioType[] = ["direct", "paraphrased", "edge_case"];
  if (includeSemantic) {
    types.splice(1, 0, "semantic"); // Insert after direct
  }
  if (includeNegative) {
    types.push("negative");
  }
  return types;
}

/** Distribute remaining count across types */
function distributeRemainingCount(
  types: ScenarioType[],
  remaining: number,
): Map<ScenarioType, number> {
  const distribution = new Map<ScenarioType, number>();

  if (remaining <= 0 || types.length === 0) {
    return distribution;
  }

  const perType = Math.floor(remaining / types.length);
  let leftover = remaining - perType * types.length;

  for (const type of types) {
    const typeCount = perType + (leftover > 0 ? 1 : 0);
    if (typeCount > 0) {
      distribution.set(type, typeCount);
    }
    if (leftover > 0) {
      leftover--;
    }
  }

  return distribution;
}

export function distributeScenarioTypes(
  count: number,
  includeNegative = true,
  includeSemantic = false,
): Map<ScenarioType, number> {
  if (count <= 0) {
    return new Map<ScenarioType, number>();
  }

  const types = buildScenarioTypeList(includeSemantic, includeNegative);

  // Weighted distribution: direct gets 30%, others split remaining
  const directCount = Math.max(1, Math.ceil(count * 0.3));
  const remaining = count - directCount;
  const otherTypes = types.filter((t) => t !== "direct");

  const distribution = distributeRemainingCount(otherTypes, remaining);
  distribution.set("direct", directCount);

  return distribution;
}

/**
 * Calculate diversity metrics for a set of scenarios.
 *
 * @param scenarios - Generated scenarios
 * @returns Diversity metrics
 */
export function calculateDiversityMetrics(scenarios: TestScenario[]): {
  total: number;
  by_type: Record<ScenarioType, number>;
  by_component: Record<string, number>;
  base_scenarios: number;
  variations: number;
  diversity_ratio: number;
} {
  const byType: Record<ScenarioType, number> = {
    direct: 0,
    paraphrased: 0,
    edge_case: 0,
    negative: 0,
    proactive: 0,
    semantic: 0,
  };

  const byComponent: Record<string, number> = {};

  for (const scenario of scenarios) {
    byType[scenario.scenario_type]++;
    byComponent[scenario.component_ref] =
      (byComponent[scenario.component_ref] ?? 0) + 1;
  }

  // Count base scenarios (those without variation markers)
  const baseScenarios = scenarios.filter((s) => !s.id.includes("-var-")).length;
  const variations = scenarios.filter((s) => s.id.includes("-var-")).length;

  return {
    total: scenarios.length,
    by_type: byType,
    by_component: byComponent,
    base_scenarios: baseScenarios,
    variations: variations,
    diversity_ratio:
      scenarios.length > 0 ? baseScenarios / scenarios.length : 0,
  };
}
