/**
 * E2E Test Helpers
 *
 * Configuration factories and utilities for end-to-end integration tests
 * that run the full pipeline with real Anthropic SDK calls.
 *
 * @module tests/e2e/helpers
 */

import path from "node:path";

import type {
  EvalConfig,
  ExecutionConfig,
  EvaluationConfig,
  GenerationConfig,
  OutputConfig,
  ScopeConfig,
} from "../../src/types/config.js";

// =============================================================================
// Constants
// =============================================================================

/** Check if E2E tests should run */
export function shouldRunE2E(): boolean {
  return process.env.RUN_E2E_TESTS === "true";
}

/**
 * Check if MCP E2E tests should run.
 *
 * MCP tests are gated behind a separate env var because:
 * - MCP server connections add significant latency (5-10s startup)
 * - External dependencies (npx, network) may cause flakiness
 * - Detection logic is already validated in unit tests
 *
 * Run with: RUN_E2E_TESTS=true RUN_E2E_MCP_TESTS=true npm test
 */
export function shouldRunE2EMcp(): boolean {
  return shouldRunE2E() && process.env.RUN_E2E_MCP_TESTS === "true";
}

// =============================================================================
// Configuration Factories
// =============================================================================

/**
 * Options for creating E2E configuration.
 */
export interface E2EConfigOptions {
  /** Plugin path (defaults to test fixture) */
  pluginPath?: string;
  /** Scope overrides */
  scope?: Partial<ScopeConfig>;
  /** Generation config overrides */
  generation?: Partial<GenerationConfig>;
  /** Execution config overrides */
  execution?: Partial<ExecutionConfig>;
  /** Evaluation config overrides */
  evaluation?: Partial<EvaluationConfig>;
  /** Output config overrides */
  output?: Partial<OutputConfig>;
  /** Maximum budget in USD */
  maxBudgetUsd?: number;
}

/**
 * Create complete E2E evaluation configuration.
 *
 * Uses the same models as the pipeline defaults to ensure E2E tests
 * accurately reflect production behavior. Cost is minimized through:
 * - Minimal turns and scenarios per component
 * - Programmatic detection first (avoids extra LLM calls)
 * - Rate limited API calls
 *
 * @param options - Configuration options
 * @returns Complete evaluation configuration
 *
 * @example
 * ```typescript
 * const config = createE2EConfig({
 *   scope: { skills: true },
 *   execution: { max_turns: 3 },
 * });
 * ```
 */
export function createE2EConfig(options: E2EConfigOptions = {}): EvalConfig {
  const {
    pluginPath = path.resolve(process.cwd(), "tests/fixtures/valid-plugin"),
    scope = {},
    generation = {},
    execution = {},
    evaluation = {},
    output = {},
    maxBudgetUsd = 0.5,
  } = options;

  // Minimal scope configuration
  const scopeConfig: ScopeConfig = {
    skills: false,
    agents: false,
    commands: false,
    hooks: false,
    mcp_servers: false, // MCP connections slow down tests significantly
    ...scope,
  };

  // Generation config matching pipeline defaults
  const generationConfig: GenerationConfig = {
    model: "claude-sonnet-4-5-20250929", // Match pipeline default
    scenarios_per_component: 1,
    diversity: 0, // Only base scenarios, no variations
    max_tokens: 512,
    reasoning_effort: "none",
    semantic_variations: false,
    ...generation,
  };

  // Execution config matching pipeline defaults
  const executionConfig: ExecutionConfig = {
    model: "claude-sonnet-4-20250514", // Match pipeline default
    max_turns: 2,
    timeout_ms: 60000, // 60 second timeout per scenario
    max_budget_usd: maxBudgetUsd,
    // E2E tests use batched sessions (production default) for performance.
    // Sessions are reset between scenarios via /clear commands to maintain isolation.
    // Set session_isolation: true for isolated testing if needed.
    session_isolation: false,
    permission_bypass: true,
    disallowed_tools: ["Write", "Edit", "Bash"], // Block file modifications
    num_reps: 1,
    additional_plugins: [],
    requests_per_second: 5, // Higher rate limit for faster E2E (tests run sequentially)
    ...execution,
  };

  // Evaluation config matching pipeline defaults
  const evaluationConfig: EvaluationConfig = {
    model: "claude-sonnet-4-5-20250929", // Match pipeline default
    max_tokens: 256,
    detection_mode: "programmatic_first", // Use programmatic detection primarily
    reasoning_effort: "none",
    num_samples: 1,
    aggregate_method: "average",
    include_citations: false,
    ...evaluation,
  };

  // Output configuration
  const outputConfig: OutputConfig = {
    format: "json",
    include_cli_summary: false,
    junit_test_suite_name: "e2e-tests",
    sanitize_transcripts: false,
    sanitize_logs: false,
    ...output,
  };

  return {
    plugin: {
      path: pluginPath,
    },
    scope: scopeConfig,
    generation: generationConfig,
    execution: executionConfig,
    evaluation: evaluationConfig,
    output: outputConfig,
    dry_run: false,
    estimate_costs: false,
    batch_threshold: 100, // Never use batching for E2E
    force_synchronous: true,
    poll_interval_ms: 1000,
    batch_timeout_ms: 3600000, // 1 hour (not used since force_synchronous is true)
    rewind_file_changes: true,
    debug: false,
    verbose: false,
    max_concurrent: 3, // Parallel execution for faster E2E tests
  };
}

// =============================================================================
// Validation Utilities
// =============================================================================

/**
 * Validate E2E environment is properly configured.
 *
 * @throws Error if required environment variables are missing
 */
export function validateE2EEnvironment(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("E2E tests require ANTHROPIC_API_KEY environment variable");
  }
}

/**
 * Check if cost is within E2E budget.
 *
 * @param costUsd - Cost in USD
 * @returns True if within budget
 */
export function isWithinE2EBudget(costUsd: number): boolean {
  const maxCostUsd = process.env.E2E_MAX_COST_USD
    ? Number.parseFloat(process.env.E2E_MAX_COST_USD)
    : 5.0;
  return costUsd <= maxCostUsd;
}
