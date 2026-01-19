/**
 * CLI option parsing and validation.
 */
import type { PipelineStage } from "../state/index.js";

/**
 * Valid pipeline stages for resume command.
 */
export const VALID_STAGES = [
  "analysis",
  "generation",
  "execution",
  "evaluation",
] as const;

/**
 * Extracted resume command options.
 */
export interface ResumeOptions {
  pluginName: string | undefined;
  runId: string | undefined;
  fromStage: PipelineStage | undefined;
  error: string | undefined;
}

/**
 * Extract and validate resume command options.
 */
export function extractResumeOptions(
  options: Record<string, unknown>,
): ResumeOptions {
  const rawPluginName = options["plugin"];
  const rawRunId = options["runId"];
  const rawFromStage = options["fromStage"];

  const pluginName =
    typeof rawPluginName === "string" ? rawPluginName : undefined;
  const runId = typeof rawRunId === "string" ? rawRunId : undefined;

  // Validate fromStage is a valid pipeline stage
  let fromStage: PipelineStage | undefined;
  let error: string | undefined;

  if (rawFromStage !== undefined) {
    if (
      typeof rawFromStage === "string" &&
      VALID_STAGES.includes(rawFromStage as (typeof VALID_STAGES)[number])
    ) {
      fromStage = rawFromStage as PipelineStage;
    } else {
      const stageStr =
        typeof rawFromStage === "string"
          ? rawFromStage
          : JSON.stringify(rawFromStage);
      error = `Invalid stage: ${stageStr}. Must be one of: ${VALID_STAGES.join(", ")}`;
    }
  }

  return { pluginName, runId, fromStage, error };
}

/**
 * Extracted report command options.
 */
export interface ReportOptions {
  pluginName: string | undefined;
  runId: string | undefined;
  outputFormat: string;
  cliOutput: boolean | undefined;
}

/**
 * Extract and validate report command options.
 */
export function extractReportOptions(
  options: Record<string, unknown>,
): ReportOptions {
  const rawPluginName = options["plugin"];
  const rawRunId = options["runId"];
  const rawOutput = options["output"];
  const rawCli = options["cli"];

  return {
    pluginName: typeof rawPluginName === "string" ? rawPluginName : undefined,
    runId: typeof rawRunId === "string" ? rawRunId : undefined,
    outputFormat: typeof rawOutput === "string" ? rawOutput : "json",
    cliOutput: typeof rawCli === "boolean" ? rawCli : undefined,
  };
}
