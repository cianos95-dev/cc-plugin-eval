/**
 * CLI options schema for Zod validation.
 *
 * This module provides a Zod schema for validating CLI options,
 * replacing manual type checks with centralized validation.
 */

import { z } from "zod";

import { OutputFormatSchema } from "./schema.js";

/**
 * Schema for CLI options validation.
 *
 * Validates and transforms Commander.js options into typed CLIOptions.
 */
export const CLIOptionsSchema = z.object({
  plugin: z.string().optional(),
  marketplace: z.string().optional(),
  dryRun: z.boolean().optional(),
  verbose: z.boolean().optional(),
  debug: z.boolean().optional(),
  fast: z.boolean().optional(),
  failedRun: z.string().optional(),
  // Transform comma-separated string to array, filtering empty values
  withPlugins: z
    .string()
    .optional()
    .transform((val) =>
      val?.trim()
        ? val
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    ),
  // Validate output format against the existing OutputFormatSchema
  output: OutputFormatSchema.optional(),
  estimate: z.boolean().optional(),
  noBatch: z.boolean().optional(),
  rewind: z.boolean().optional(),
  semantic: z.boolean().optional(),
  // Validate samples/reps as positive integers
  samples: z.number().int().positive().optional(),
  reps: z.number().int().positive().optional(),
});

/**
 * Type derived from the CLI options schema.
 */
export type CLIOptions = z.infer<typeof CLIOptionsSchema>;

/**
 * Extracts and validates CLI options from Commander.js output.
 *
 * @param options - Raw options from Commander.js (Record<string, unknown>)
 * @returns Validated CLI options (partial, since all fields are optional)
 * @throws Error if validation fails with a descriptive message
 */
export function extractCLIOptions(
  options: Record<string, unknown>,
): CLIOptions {
  const result = CLIOptionsSchema.safeParse(options);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Invalid CLI options: ${issues}`);
  }

  // Filter out undefined values to return only defined options
  return Object.fromEntries(
    Object.entries(result.data).filter(([, value]) => value !== undefined),
  ) as CLIOptions;
}
