/**
 * Centralized type exports.
 */

// Plugin types
export type {
  PluginErrorType,
  McpServerStatus,
  TimingBreakdown,
  PluginLoadDiagnostics,
  PluginLoadResult,
  PluginManifest,
  ResolvedPaths,
  PreflightError,
  PreflightWarning,
  PreflightResult,
} from "./plugin.js";

// Plugin constants
export { MCP_STATUS_NEEDS_AUTH } from "./plugin.js";

// Component types
export type {
  SemanticIntent,
  SemanticVariation,
  SkillComponent,
  AgentExample,
  AgentComponent,
  CommandComponent,
  HookType,
  HookEventType,
  HookExpectedBehavior,
  HookAction,
  HookEventHandler,
  HookComponent,
} from "./components.js";

// MCP types
export type {
  McpServerType,
  McpToolDefinition,
  McpServerConfig,
  McpConfigFile,
  McpComponent,
} from "./mcp.js";

// Scenario types
export type {
  ScenarioType,
  ComponentType,
  SetupMessage,
  TestScenario,
  DiversityConfig,
  ScenarioDistribution,
  BaseScenario,
  ScenarioVariation,
} from "./scenario.js";

// Transcript types
export type {
  ModelUsage,
  ToolCapture,
  SubagentCapture,
  HookResponseCapture,
  TranscriptMetadata,
  UserEvent,
  ToolCall,
  AssistantEvent,
  ToolResultEvent,
  TranscriptErrorType,
  TranscriptErrorEvent,
  TranscriptEvent,
  Transcript,
  ExecutionResult,
  TerminationType,
  ToolProgressData,
  ToolSummaryData,
  SDKEventCapture,
} from "./transcript.js";

// Evaluation types
export type {
  ProgrammaticDetection,
  TriggeredComponent,
  ConflictAnalysis,
  Citation,
  HighlightWithCitation,
  JudgeResponse,
  MultiSampleResult,
  DetectionSource,
  EvaluationResult,
  ComponentMetrics,
  MultiSampleStats,
  SemanticStats,
  RepetitionStats,
  CacheStats,
  EvalMetrics,
  MetaJudgmentResult,
} from "./evaluation.js";

// Evaluation Zod schemas (runtime validation)
export {
  CitationSchema,
  HighlightWithCitationSchema,
  JudgeResponseSchema,
} from "./evaluation.js";

// Config types
export type {
  PluginConfig,
  MarketplaceConfig,
  ScopeConfig,
  ReasoningEffort,
  SessionStrategy,
  TimeoutStrategy,
  GenerationConfig,
  ExecutionConfig,
  DetectionMode,
  AggregateMethod,
  EvaluationConfig,
  OutputFormat,
  OutputConfig,
  ResumeConfig,
  FastModeConfig,
  McpServersConfig,
  ConflictDetectionConfig,
  TimeoutsConfig,
  RetryTuningConfig,
  TokenEstimatesConfig,
  LimitsConfig,
  BatchingConfig,
  TuningConfig,
  EvalConfig,
} from "./config.js";

// State types from state.ts
export type {
  SkillTriggerInfo,
  AgentTriggerInfo,
  CommandTriggerInfo,
  HookTriggerInfo,
  McpTriggerInfo,
  AnalysisOutput,
} from "./state.js";

// State types from state module (canonical source)
export type { PipelineStage, PipelineState } from "../state/index.js";

// Progress types
export type { ProgressCallbacks } from "./progress.js";

// Cost types
export type {
  ModelPricing,
  TokenEstimate,
  PipelineCostEstimate,
} from "./cost.js";
