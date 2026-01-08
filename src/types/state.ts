/**
 * State management type definitions.
 * Represents pipeline state for resume capability.
 */

import type {
  AgentExample,
  AgentComponent,
  CommandComponent,
  HookComponent,
  HookEventType,
  HookExpectedBehavior,
  SkillComponent,
} from "./components.js";
import type { McpComponent, McpServerType } from "./mcp.js";
import type { PluginLoadResult } from "./plugin.js";
import type { TestScenario } from "./scenario.js";
import type { ExecutionResult } from "./transcript.js";

/**
 * Pipeline stage names.
 */
export type PipelineStage =
  | "analysis"
  | "generation"
  | "execution"
  | "evaluation";

/**
 * Trigger understanding for skills.
 */
export interface SkillTriggerInfo {
  triggers: string[];
  description: string;
}

/**
 * Trigger understanding for agents.
 */
export interface AgentTriggerInfo {
  examples: AgentExample[];
  description: string;
}

/**
 * Trigger understanding for commands.
 */
export interface CommandTriggerInfo {
  invocation: string;
  arguments: string[];
}

/**
 * Trigger understanding for hooks.
 */
export interface HookTriggerInfo {
  eventType: HookEventType;
  matcher: string;
  matchingTools: string[];
  expectedBehavior: HookExpectedBehavior;
}

/**
 * Trigger understanding for MCP servers.
 */
export interface McpTriggerInfo {
  serverType: McpServerType;
  authRequired: boolean;
  envVars: string[];
  knownTools: string[];
}

/**
 * Output from Stage 1: Analysis.
 */
export interface AnalysisOutput {
  plugin_name: string;
  plugin_load_result: PluginLoadResult;
  components: {
    skills: SkillComponent[];
    agents: AgentComponent[];
    commands: CommandComponent[];
    hooks: HookComponent[];
    mcp_servers: McpComponent[];
  };
  trigger_understanding: {
    skills: Record<string, SkillTriggerInfo>;
    agents: Record<string, AgentTriggerInfo>;
    commands: Record<string, CommandTriggerInfo>;
    hooks: Record<string, HookTriggerInfo>;
    mcp_servers: Record<string, McpTriggerInfo>;
  };
}

/**
 * Pipeline state for resume capability.
 */
export interface PipelineState {
  run_id: string;
  stage: PipelineStage;
  analysis?: AnalysisOutput;
  scenarios?: TestScenario[];
  executions?: ExecutionResult[];
  timestamp: string;
}
