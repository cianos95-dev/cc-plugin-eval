/**
 * CLI output formatters for evaluation results.
 */
import type { EvalMetrics } from "../types/index.js";

/**
 * Validated evaluation result fields.
 */
interface ValidatedResult {
  /** Scenario ID */
  scenarioId: string;
  /** Whether the component was triggered */
  triggered: boolean;
  /** Expected trigger state */
  expected: boolean | undefined;
  /** Whether the result passed (triggered matches expected) */
  passed: boolean;
  /** Optional summary text */
  summary: string;
}

/**
 * Extract and validate evaluation result fields.
 *
 * Performs runtime validation to ensure values are correct types
 * from untyped Record<string, unknown> objects.
 *
 * @param result - Untyped evaluation result
 * @returns Validated result with typed fields
 */
function validateEvalResult(result: Record<string, unknown>): ValidatedResult {
  const scenarioId =
    typeof result["scenario_id"] === "string"
      ? result["scenario_id"]
      : "unknown";
  const triggered =
    typeof result["triggered"] === "boolean" ? result["triggered"] : false;
  const expected =
    typeof result["expected_trigger"] === "boolean"
      ? result["expected_trigger"]
      : undefined;
  const passed = expected === undefined || triggered === expected;
  const summary =
    typeof result["summary"] === "string" ? result["summary"] : "";

  return { scenarioId, triggered, expected, passed, summary };
}

/**
 * Output CLI summary of evaluation results.
 */
export function outputCLISummary(evaluation: {
  plugin_name: string;
  metrics: Record<string, unknown>;
  results: Record<string, unknown>[];
}): void {
  const metrics = evaluation.metrics as {
    accuracy: number;
    trigger_rate: number;
    total_scenarios: number;
    triggered_count: number;
    avg_quality: number;
    conflict_count: number;
  };

  console.log("\n" + "=".repeat(60));
  console.log(`Plugin: ${evaluation.plugin_name}`);
  console.log("=".repeat(60));
  console.log(`Total Scenarios: ${String(metrics.total_scenarios)}`);
  console.log(`Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`);
  console.log(`Trigger Rate: ${(metrics.trigger_rate * 100).toFixed(1)}%`);
  console.log(
    `Triggered: ${String(metrics.triggered_count)}/${String(metrics.total_scenarios)}`,
  );

  if (metrics.avg_quality > 0) {
    console.log(`Avg Quality: ${metrics.avg_quality.toFixed(1)}/10`);
  }

  if (metrics.conflict_count > 0) {
    console.log(`Conflicts: ${String(metrics.conflict_count)}`);
  }

  console.log("=".repeat(60) + "\n");
}

/**
 * Output JUnit XML format.
 */
export function outputJUnitXML(
  pluginName: string,
  results: Record<string, unknown>[],
): void {
  const failures = results.filter(
    (r) => r["triggered"] !== r["expected_trigger"],
  );

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<testsuites name="cc-plugin-eval" tests="${String(results.length)}" failures="${String(failures.length)}">\n`;
  xml += `  <testsuite name="${pluginName}" tests="${String(results.length)}" failures="${String(failures.length)}">\n`;

  for (const result of results) {
    const { scenarioId, triggered, expected, passed, summary } =
      validateEvalResult(result);

    xml += `    <testcase name="${scenarioId}" classname="${pluginName}">\n`;
    if (!passed) {
      xml += `      <failure message="Expected ${String(expected)}, got ${String(triggered)}">${summary}</failure>\n`;
    }
    xml += `    </testcase>\n`;
  }

  xml += "  </testsuite>\n";
  xml += "</testsuites>\n";

  console.log(xml);
}

/**
 * Output TAP format.
 */
export function outputTAP(results: Record<string, unknown>[]): void {
  console.log(`TAP version 14`);
  console.log(`1..${String(results.length)}`);

  let i = 1;
  for (const result of results) {
    const { scenarioId, triggered, expected, passed } =
      validateEvalResult(result);

    if (passed) {
      console.log(`ok ${String(i)} - ${scenarioId}`);
    } else {
      console.log(`not ok ${String(i)} - ${scenarioId}`);
      console.log(`  ---`);
      console.log(`  expected: ${String(expected)}`);
      console.log(`  actual: ${String(triggered)}`);
      console.log(`  ...`);
    }
    i++;
  }
}

/**
 * Output final summary of evaluation.
 */
export function outputFinalSummary(
  resultsDir: string,
  metrics: EvalMetrics,
): void {
  const m = metrics;

  console.log("\n" + "=".repeat(60));
  console.log("EVALUATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`Results: ${resultsDir}`);
  console.log(`Accuracy: ${(m.accuracy * 100).toFixed(1)}%`);
  console.log(`Trigger Rate: ${(m.trigger_rate * 100).toFixed(1)}%`);
  console.log(
    `Scenarios: ${String(m.triggered_count)}/${String(m.total_scenarios)} triggered`,
  );

  if (m.avg_quality > 0) {
    console.log(`Quality Score: ${m.avg_quality.toFixed(1)}/10`);
  }

  if (m.conflict_count > 0) {
    console.log(`Conflicts Detected: ${String(m.conflict_count)}`);
  }

  console.log("=".repeat(60) + "\n");
}
