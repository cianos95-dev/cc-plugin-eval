/**
 * Evaluation type definitions.
 * Represents detection results, judgments, and metrics.
 */

import { z } from "zod";

import type { ComponentType } from "./scenario.js";

/**
 * Programmatic detection result with 100% confidence.
 */
export interface ProgrammaticDetection {
  component_type: ComponentType;
  component_name: string;
  /** Programmatic detection is always 100% confident */
  confidence: 100;
  tool_name: string;
  evidence: string;
  timestamp: number;
}

/**
 * Component triggered during evaluation.
 */
export interface TriggeredComponent {
  component_type: string;
  component_name: string;
  confidence: number;
}

/**
 * Conflict analysis result.
 */
export interface ConflictAnalysis {
  expected_component: string;
  expected_component_type: ComponentType;
  all_triggered_components: TriggeredComponent[];
  has_conflict: boolean;
  conflict_severity: "none" | "minor" | "major";
  conflict_reason?: string;
}

/**
 * Citation linking highlight to message.
 */
export interface Citation {
  message_id: string;
  quoted_text: string;
  /** Start and end character positions */
  position: [number, number];
  /** If citing a tool call */
  tool_call_id?: string;
}

/**
 * Zod schema for Citation validation.
 */
export const CitationSchema = z.object({
  message_id: z.string(),
  quoted_text: z.string(),
  position: z.tuple([z.number(), z.number()]),
  tool_call_id: z.string().optional(),
});

/**
 * Highlight with citation for grounding.
 */
export interface HighlightWithCitation {
  description: string;
  citation: Citation;
}

/**
 * Zod schema for HighlightWithCitation validation.
 */
export const HighlightWithCitationSchema = z.object({
  description: z.string(),
  citation: CitationSchema,
});

/**
 * LLM judge response.
 */
export interface JudgeResponse {
  quality_score: number;
  response_relevance: number;
  trigger_accuracy: "correct" | "incorrect" | "partial";
  issues: string[];
  highlights?: HighlightWithCitation[];
  summary: string;
}

/**
 * Zod schema for JudgeResponse validation.
 *
 * Provides runtime validation to complement structured output API guarantees.
 * Use with .parse() for strict validation or .safeParse() for error handling.
 */
export const JudgeResponseSchema = z.object({
  quality_score: z.number().min(0).max(10),
  response_relevance: z.number().min(0).max(10),
  trigger_accuracy: z.enum(["correct", "incorrect", "partial"]),
  issues: z.array(z.string()),
  highlights: z.array(HighlightWithCitationSchema).optional(),
  summary: z.string(),
});

/**
 * Multi-sample judgment result.
 */
export interface MultiSampleResult {
  individual_scores: number[];
  aggregated_score: number;
  score_variance: number;
  consensus_trigger_accuracy: "correct" | "incorrect" | "partial";
  /** Whether all samples agreed on trigger_accuracy (unanimous vote) */
  is_unanimous: boolean;
  all_issues: string[];
  representative_response: JudgeResponse;
  /** Total cost of all LLM judge calls for this evaluation in USD */
  total_cost_usd: number;
}

/**
 * Source of detection.
 */
export type DetectionSource = "programmatic" | "llm" | "both";

/**
 * Complete evaluation result for a scenario.
 */
export interface EvaluationResult {
  scenario_id: string;
  triggered: boolean;
  confidence: number;
  quality_score: number | null;
  evidence: string[];
  issues: string[];
  summary: string;
  /** Detection source */
  detection_source: DetectionSource;
  /** All components that triggered */
  all_triggered_components: TriggeredComponent[];
  has_conflict: boolean;
  conflict_severity: "none" | "minor" | "major";
}

/**
 * Per-component metrics.
 */
export interface ComponentMetrics {
  trigger_rate: number;
  accuracy: number;
  avg_quality: number;
  scenarios_count: number;
  false_positives: number;
  false_negatives: number;
}

/**
 * Multi-sampling statistics.
 */
export interface MultiSampleStats {
  samples_per_scenario: number;
  avg_score_variance: number;
  /** Scenarios with variance > threshold */
  high_variance_scenarios: string[];
  /** % scenarios where all samples agreed */
  consensus_rate: number;
}

/**
 * Semantic testing statistics.
 */
export interface SemanticStats {
  total_semantic_scenarios: number;
  semantic_trigger_rate: number;
  variations_by_type: Record<string, { count: number; trigger_rate: number }>;
}

/**
 * Repetition statistics.
 */
export interface RepetitionStats {
  reps_per_scenario: number;
  /** % scenarios with same result across reps */
  consistency_rate: number;
  /** Scenarios with inconsistent results */
  flaky_scenarios: string[];
}

/**
 * Cache usage statistics for cost analysis.
 */
export interface CacheStats {
  /** Total cache read tokens across all scenarios */
  total_cache_read_tokens: number;
  /** Total cache creation tokens across all scenarios */
  total_cache_creation_tokens: number;
  /** Cache hit rate (read tokens / total input tokens) */
  cache_hit_rate: number;
  /** Estimated cost savings from caching in USD */
  savings_usd: number;
}

/**
 * Aggregate evaluation metrics.
 */
export interface EvalMetrics {
  total_scenarios: number;
  triggered_count: number;
  trigger_rate: number;
  accuracy: number;
  avg_quality: number;
  by_component: Record<string, ComponentMetrics>;

  /** Conflict metrics */
  conflict_count: number;
  major_conflicts: number;
  minor_conflicts: number;

  /** Cost tracking - aggregate total across all stages */
  total_cost_usd: number;
  avg_cost_per_scenario: number;
  total_api_duration_ms: number;

  /** Per-stage cost breakdown */
  generation_cost_usd: number;
  execution_cost_usd: number;
  evaluation_cost_usd: number;

  /** Error tracking */
  error_count: number;
  errors_by_type: Record<string, number>;

  /** Multi-sampling statistics */
  multi_sample_stats?: MultiSampleStats;

  /** Semantic testing stats */
  semantic_stats?: SemanticStats;

  /** Repetition statistics */
  repetition_stats?: RepetitionStats;

  /** Cache usage statistics */
  cache_stats?: CacheStats;
}

/**
 * Meta-judgment of overall eval suite quality.
 */
export interface MetaJudgmentResult {
  suite_diversity_score: number;
  coverage_completeness: number;
  scenario_quality_distribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
  identified_gaps: string[];
  false_positive_patterns: string[];
  false_negative_patterns: string[];
  recommendations: string[];
}
