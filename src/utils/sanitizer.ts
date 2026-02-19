/**
 * Sanitizer utility for PII filtering in verbose transcript logging.
 *
 * Provides pattern-based redaction of sensitive data from logs and transcripts.
 * Designed for defense-in-depth in security-conscious environments.
 *
 * @module
 */

import { ConfigLoadError } from "../config/loader.js";

import type { SanitizationConfig as OutputSanitizationConfig } from "../types/config.js";
import type {
  AssistantEvent,
  ToolResultEvent,
  TranscriptEvent,
  UserEvent,
} from "../types/transcript.js";

/**
 * A redaction pattern with name, regex, and replacement string.
 */
export interface RedactionPattern {
  /** Human-readable name for the pattern */
  name: string;
  /** Regex pattern to match (should have 'g' flag) */
  pattern: RegExp;
  /** Replacement string for matches */
  replacement: string;
}

/**
 * Configuration for custom patterns in config.yaml format.
 */
export interface CustomPatternConfig {
  /** Regex pattern string (will be compiled with 'g' flag) */
  pattern: string;
  /** Replacement string for matches */
  replacement: string;
}

/**
 * Result of analyzing a regex pattern for ReDoS vulnerability.
 */
export interface PatternSafetyAnalysis {
  /** Risk score (0 = safe, higher = riskier). Score >= REDOS_SAFETY_THRESHOLD is considered unsafe. */
  score: number;
  /** Human-readable warnings explaining risk factors */
  warnings: string[];
  /** Whether the pattern is considered safe (score < REDOS_SAFETY_THRESHOLD) */
  isSafe: boolean;
}

/**
 * Result of fuzz testing a regex pattern against adversarial inputs.
 */
export interface FuzzTestResult {
  /** Whether the pattern passed all fuzz tests within the timeout */
  passed: boolean;
  /** Maximum execution time observed across all tests (in ms) */
  maxExecutionMs: number;
  /** Number of tests run */
  testsRun: number;
  /** The input that caused failure (if any) */
  failedInput?: string;
}

/**
 * Options for fuzz testing regex patterns.
 */
export interface FuzzTestOptions {
  /** Maximum time allowed per test in milliseconds (default: 50) */
  timeoutMs?: number;
}

/**
 * Options for regex pattern validation.
 */
export interface ValidateRegexPatternOptions {
  /** Skip ReDoS safety analysis (default: false) */
  skipSafetyCheck?: boolean;
  /** Timeout for fuzz testing in milliseconds (default: 50) */
  fuzzTimeoutMs?: number;
}

/**
 * Sanitization configuration from config.yaml.
 */
export interface SanitizationConfig {
  /** Enable/disable sanitization (default: false for backwards compatibility) */
  enabled: boolean;
  /** Custom redaction patterns to apply */
  custom_patterns?: CustomPatternConfig[];
}

/**
 * Options for creating a sanitizer function.
 */
export interface CreateSanitizerOptions {
  /** Enable/disable sanitization (default: true) */
  enabled?: boolean;
  /** Custom patterns to use (replaces defaults unless mergeWithDefaults) */
  patterns?: RedactionPattern[];
  /** Merge custom patterns with defaults (default: false) */
  mergeWithDefaults?: boolean;
  /**
   * Maximum input length to process (characters).
   * Content exceeding this limit will be replaced with [REDACTED_OVERSIZED_CONTENT].
   * Provides defense-in-depth against ReDoS by bounding worst-case execution time.
   * @default 100000 (100KB)
   */
  maxInputLength?: number;
}

/**
 * A sanitizer function that redacts sensitive data from strings.
 */
export type SanitizerFunction = (content: string) => string;

/**
 * Default redaction patterns for common PII types.
 *
 * Patterns are applied in order - more specific patterns should come first.
 */
export const DEFAULT_REDACTION_PATTERNS: RedactionPattern[] = [
  // Anthropic API keys (most specific first)
  {
    name: "anthropic_api_key",
    pattern: /sk-ant-[a-zA-Z0-9_-]+/g,
    replacement: "[REDACTED_ANTHROPIC_KEY]",
  },

  // Google API keys (AIza prefix, 39 chars total)
  {
    name: "google_api_key",
    pattern: /AIza[a-zA-Z0-9_-]{35}/g,
    replacement: "[REDACTED_GOOGLE_KEY]",
  },

  // API key in URL query parameters (?key=... or &key=...)
  {
    name: "url_api_key_param",
    pattern: /[?&]key=[a-zA-Z0-9_-]+/g,
    replacement: "?key=[REDACTED]",
  },

  // Generic API keys (32+ alphanumeric chars after sk-)
  {
    name: "generic_api_key",
    pattern: /sk-[a-zA-Z0-9]{32,}/g,
    replacement: "[REDACTED_API_KEY]",
  },

  // JWT tokens (three base64 parts separated by dots)
  {
    name: "jwt_token",
    pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replacement: "[REDACTED_JWT]",
  },

  // Bearer tokens (case-insensitive)
  {
    name: "bearer_token",
    pattern: /[Bb][Ee][Aa][Rr][Ee][Rr]\s+[a-zA-Z0-9._-]+/g,
    replacement: "Bearer [REDACTED_TOKEN]",
  },

  // Email addresses
  {
    name: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[REDACTED_EMAIL]",
  },

  // US phone numbers (XXX-XXX-XXXX, XXX.XXX.XXXX, XXXXXXXXXX)
  {
    name: "phone_us",
    pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    replacement: "[REDACTED_PHONE]",
  },

  // Social Security Numbers (XXX-XX-XXXX)
  {
    name: "ssn",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[REDACTED_SSN]",
  },

  // Credit card numbers (XXXX XXXX XXXX XXXX or XXXX-XXXX-XXXX-XXXX)
  {
    name: "credit_card",
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: "[REDACTED_CARD]",
  },
];

/**
 * Threshold for considering a pattern unsafe.
 * Lowered from 10 to 7 for stricter protection as part of defense-in-depth.
 */
export const REDOS_SAFETY_THRESHOLD = 7;

/**
 * Maximum pattern length to analyze for ReDoS.
 * Prevents ReDoS in the safety analysis itself by limiting input size.
 * Patterns exceeding this are automatically flagged as potentially unsafe.
 */
const MAX_PATTERN_LENGTH = 500;

/**
 * Default maximum input length for sanitization (100KB).
 * Content exceeding this will be replaced with [REDACTED_OVERSIZED_CONTENT].
 */
const DEFAULT_MAX_INPUT_LENGTH = 100_000;

/**
 * Analyze a regex pattern for potential ReDoS vulnerability.
 *
 * SECURITY NOTE: This is Layer 2 of a multi-layer ReDoS defense strategy:
 *
 * - **Layer 1**: Syntax validation (in `validateRegexPattern`) ensures the
 *   pattern is valid before analysis.
 * - **Layer 2**: Heuristic analysis (this function) detects known dangerous
 *   patterns like nested quantifiers and overlapping alternations.
 * - **Layer 3**: Fuzz testing (in `fuzzTestPattern`) tests the pattern against
 *   adversarial inputs to catch runtime performance issues.
 * - **Layer 4**: Runtime timeout protection ensures catastrophic backtracking
 *   cannot block execution indefinitely.
 *
 * Uses heuristic analysis to detect patterns that may cause catastrophic
 * backtracking. Scoring is based on known ReDoS risk factors:
 *
 * - Nested quantifiers: `(a+)+`, `(a*)*` - 10 points each (most dangerous)
 * - Overlapping alternations: `(a|ab)*` - 10 points each (can cause exponential backtracking)
 * - Deep nesting: > 3 levels of parentheses - 1 point per extra level
 * - Unbounded repetition in groups: `(a*)+` - 5 points each
 *
 * Patterns with a score >= REDOS_SAFETY_THRESHOLD (currently 7) are considered potentially unsafe.
 *
 * @param pattern - The regex pattern string to analyze
 * @returns Analysis result with score, warnings, and safety determination
 *
 * @see https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS
 *
 * @example
 * ```typescript
 * // Safe pattern
 * analyzePatternSafety("\\d{3}-\\d{4}");
 * // { score: 0, warnings: [], isSafe: true }
 *
 * // Unsafe pattern (nested quantifiers)
 * analyzePatternSafety("(a+)+b");
 * // { score: 10, warnings: ["Nested quantifiers..."], isSafe: false }
 * ```
 */
export function analyzePatternSafety(pattern: string): PatternSafetyAnalysis {
  // Limit input length to prevent ReDoS in the analysis itself
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return {
      score: REDOS_SAFETY_THRESHOLD,
      warnings: [
        `Pattern exceeds maximum length (${String(pattern.length)} > ${String(MAX_PATTERN_LENGTH)} chars). ` +
          `Very long patterns are inherently risky and should be simplified.`,
      ],
      isSafe: false,
    };
  }

  let score = 0;
  const warnings: string[] = [];

  // Check 1: Nested quantifiers (most dangerous)
  // Pattern: quantified group followed by quantifier, e.g., (a+)+, (a*)*
  // This detects patterns like: (a+)+, (a*)+, (\w+)*, (foo+)+
  const nestedQuantifierPattern =
    /\([^()]*[+*][^()]*\)[+*]|\([^()]*[+*][^()]*\)\{/g;
  const nestedMatches = pattern.match(nestedQuantifierPattern);
  if (nestedMatches) {
    score += nestedMatches.length * 10;
    warnings.push(
      `Nested quantifiers detected (${String(nestedMatches.length)}x): ${nestedMatches.join(", ")}. ` +
        `These can cause exponential backtracking.`,
    );
  }

  // Check 2: Overlapping alternations with quantifiers, e.g., (a|ab)*
  // These patterns can cause catastrophic backtracking when alternatives share prefixes/suffixes
  const overlappingAltPattern = /\([^)]*\|[^)]*\)[+*]/g;
  const overlappingMatches = pattern.match(overlappingAltPattern);
  if (overlappingMatches) {
    score += overlappingMatches.length * 10;
    warnings.push(
      `Overlapping alternations (${String(overlappingMatches.length)}x): ${overlappingMatches.join(", ")}. ` +
        `These can cause exponential backtracking when alternatives share prefixes.`,
    );
  }

  // Check 3: Deep nesting (> 3 levels of parentheses)
  let depth = 0;
  let maxDepth = 0;
  for (const char of pattern) {
    if (char === "(") {
      depth++;
    }
    if (char === ")") {
      depth--;
    }
    maxDepth = Math.max(maxDepth, depth);
  }
  if (maxDepth > 3) {
    const extraLevels = maxDepth - 3;
    score += extraLevels;
    warnings.push(
      `Deep nesting: ${String(maxDepth)} levels (threshold: 3). ` +
        `Consider simplifying the pattern.`,
    );
  }

  // Check 4: Unbounded repetition inside groups with outer quantifier
  // More specific check for patterns like (\w*)+ or ([a-z]+)*
  const unboundedInGroupPattern =
    /\([^()]*(?:\*|\+|\{[0-9]*,\})[^()]*\)(?:\*|\+|\{[0-9]*,\})/g;
  const unboundedMatches = pattern.match(unboundedInGroupPattern);
  if (unboundedMatches && !nestedMatches) {
    // Only add if not already caught by nested quantifiers
    score += unboundedMatches.length * 5;
    warnings.push(
      `Unbounded repetition in groups (${String(unboundedMatches.length)}x): ${unboundedMatches.join(", ")}. ` +
        `Consider using possessive quantifiers or limiting repetitions.`,
    );
  }

  return {
    score,
    warnings,
    isSafe: score < REDOS_SAFETY_THRESHOLD,
  };
}

/**
 * Adversarial test inputs designed to trigger catastrophic backtracking.
 * These inputs are short enough to be safe for testing but long enough
 * to expose exponential behavior in pathological patterns.
 */
const ADVERSARIAL_INPUTS = [
  // Tests nested quantifiers like (a+)+
  "aaaaaaaaaaaaaaaaaaaaX",
  // Tests overlapping alternations like (a|ab)*
  "ababababababababababX",
  // Tests mixed patterns
  "aaaaabbbbbaaaaaX",
  // Tests with different character classes
  "xxxxxxxxxxxxxxxxxxxx!",
  // Tests word boundaries
  "wordwordwordwordwordX",
];

/**
 * Fuzz test a regex pattern against adversarial inputs.
 *
 * Tests the pattern against inputs designed to trigger catastrophic backtracking.
 * Uses synchronous timing to detect patterns that take too long to execute.
 *
 * This provides runtime protection complementing static analysis:
 * - Static analysis may miss some pathological patterns
 * - Fuzz testing catches them at config load time (not during hot path)
 *
 * @param pattern - The compiled regex pattern to test
 * @param options - Options including timeout threshold
 * @returns Result indicating whether the pattern passed and timing metrics
 *
 * @example
 * ```typescript
 * // Safe pattern passes
 * const result1 = fuzzTestPattern(/\d{3}-\d{4}/g, { timeoutMs: 50 });
 * console.log(result1.passed); // true
 *
 * // Pathological pattern fails
 * const result2 = fuzzTestPattern(/(a+)+$/g, { timeoutMs: 50 });
 * console.log(result2.passed); // false
 * ```
 */
export function fuzzTestPattern(
  pattern: RegExp,
  options: FuzzTestOptions = {},
): FuzzTestResult {
  const { timeoutMs = 50 } = options;

  let maxExecutionMs = 0;
  let testsRun = 0;
  let failedInputValue: string | undefined;

  for (const input of ADVERSARIAL_INPUTS) {
    testsRun++;

    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;

    const start = performance.now();
    try {
      pattern.test(input);
    } catch {
      // Pattern threw an error - treat as failure
      return {
        passed: false,
        maxExecutionMs,
        testsRun,
        failedInput: input,
      };
    }
    const elapsed = performance.now() - start;

    maxExecutionMs = Math.max(maxExecutionMs, elapsed);

    if (elapsed > timeoutMs) {
      failedInputValue = input;
      return {
        passed: false,
        maxExecutionMs,
        testsRun,
        failedInput: failedInputValue,
      };
    }
  }

  return {
    passed: true,
    maxExecutionMs,
    testsRun,
  };
}

/**
 * Validate and compile a regex pattern string.
 *
 * Validates that the pattern is syntactically correct and compiles it
 * with the global flag. Optionally checks for ReDoS vulnerability using
 * heuristic analysis.
 *
 * SECURITY NOTE: Semgrep may flag the `new RegExp(pattern)` call below as
 * "detect-non-literal-regexp". This is a false positive because the pattern
 * is validated through a multi-layer defense before execution:
 * - Layer 1: Syntax validation (this function)
 * - Layer 2: Heuristic analysis via `analyzePatternSafety()`
 * - Layer 3: Fuzz testing via `fuzzTestPattern()`
 * - Layer 4: Runtime timeout protection
 *
 * @param pattern - The regex pattern string to validate and compile
 * @param name - Human-readable name for the pattern (used in error messages)
 * @param options - Validation options (e.g., skipSafetyCheck)
 * @returns Compiled RegExp with 'g' flag
 * @throws ConfigLoadError if the pattern has invalid regex syntax or is unsafe
 *
 * @example
 * ```typescript
 * // Valid pattern
 * const regex = validateRegexPattern("INTERNAL-\\w+", "internal_id");
 * console.log(regex.test("INTERNAL-abc123")); // true
 *
 * // Invalid pattern throws
 * validateRegexPattern("[invalid(", "broken"); // throws ConfigLoadError
 *
 * // Unsafe pattern throws (unless bypassed)
 * validateRegexPattern("(a+)+", "dangerous"); // throws ConfigLoadError
 * validateRegexPattern("(a+)+", "dangerous", { skipSafetyCheck: true }); // OK
 * ```
 */
export function validateRegexPattern(
  pattern: string,
  name: string,
  options?: ValidateRegexPatternOptions,
): RegExp {
  // First validate syntax
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "g");
  } catch (error) {
    throw new ConfigLoadError(
      `Invalid regex pattern "${name}": ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }

  // Then check for ReDoS if not skipped
  if (!options?.skipSafetyCheck) {
    const safety = analyzePatternSafety(pattern);

    if (!safety.isSafe) {
      const warningList = safety.warnings.map((w) => `  - ${w}`).join("\n");
      throw new ConfigLoadError(
        `Pattern "${name}" may be vulnerable to ReDoS (risk score: ${String(safety.score)}/${String(REDOS_SAFETY_THRESHOLD)}):\n` +
          `${warningList}\n\n` +
          `💡 Tip: Consider using possessive quantifiers (a++, a*+) or atomic groups (?> ...)\n` +
          `   to prevent backtracking. Node.js 20+ supports these features.\n\n` +
          `To bypass this check, add the following to your config.yaml:\n\n` +
          `  output:\n` +
          `    sanitization:\n` +
          `      pattern_safety_acknowledged: true\n\n` +
          `Learn more: https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS`,
      );
    }

    // Fuzz test the pattern against adversarial inputs
    const fuzzResult = fuzzTestPattern(regex, {
      timeoutMs: options?.fuzzTimeoutMs ?? 50,
    });

    if (!fuzzResult.passed) {
      throw new ConfigLoadError(
        `Pattern "${name}" failed fuzz testing - took ${fuzzResult.maxExecutionMs.toFixed(1)}ms on adversarial input.\n` +
          `This pattern may cause performance issues at runtime.\n\n` +
          `💡 Tip: Consider using possessive quantifiers (a++, a*+) or atomic groups (?> ...)\n` +
          `   to prevent backtracking. Node.js 20+ supports these features.\n\n` +
          `Failed input: "${fuzzResult.failedInput ?? "unknown"}"\n\n` +
          `To bypass this check, add the following to your config.yaml:\n\n` +
          `  output:\n` +
          `    sanitization:\n` +
          `      pattern_safety_acknowledged: true\n\n` +
          `Learn more: https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS`,
      );
    }
  }

  return regex;
}

/**
 * Create a sanitizer function with the specified options.
 *
 * @param options - Configuration options
 * @returns A function that sanitizes strings
 *
 * @example
 * ```typescript
 * // Use default patterns
 * const sanitizer = createSanitizer();
 * console.log(sanitizer("Email: user@example.com"));
 * // Output: "Email: [REDACTED_EMAIL]"
 *
 * // Use custom patterns
 * const customSanitizer = createSanitizer({
 *   patterns: [{ name: "secret", pattern: /SECRET-\w+/g, replacement: "[HIDDEN]" }],
 *   mergeWithDefaults: true
 * });
 * ```
 */
export function createSanitizer(
  options: CreateSanitizerOptions = {},
): SanitizerFunction {
  const {
    enabled = true,
    patterns,
    mergeWithDefaults = false,
    maxInputLength = DEFAULT_MAX_INPUT_LENGTH,
  } = options;

  // If disabled, return identity function
  if (!enabled) {
    return (content: string) => content;
  }

  // Determine which patterns to use
  let activePatterns: RedactionPattern[];

  if (patterns && patterns.length > 0) {
    if (mergeWithDefaults) {
      // Custom patterns first, then defaults
      activePatterns = [...patterns, ...DEFAULT_REDACTION_PATTERNS];
    } else {
      // Only custom patterns
      activePatterns = patterns;
    }
  } else {
    // Default patterns only
    activePatterns = DEFAULT_REDACTION_PATTERNS;
  }

  // Return sanitizer function with input length protection
  return (content: string): string => {
    // Defense-in-depth: reject oversized content to bound worst-case execution time
    if (content.length > maxInputLength) {
      return "[REDACTED_OVERSIZED_CONTENT]";
    }

    let sanitized = content;

    for (const { pattern, replacement } of activePatterns) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      sanitized = sanitized.replace(pattern, replacement);
    }

    return sanitized;
  };
}

/**
 * Sanitize content using default patterns.
 *
 * Convenience function for one-off sanitization without creating a reusable sanitizer.
 *
 * @param content - String content to sanitize
 * @returns Sanitized string with sensitive data redacted
 *
 * @example
 * ```typescript
 * const clean = sanitizeContent("API key: sk-ant-api03-secret123");
 * // Output: "API key: [REDACTED_ANTHROPIC_KEY]"
 * ```
 */
export function sanitizeContent(content: string): string {
  const sanitizer = createSanitizer();
  return sanitizer(content);
}

/**
 * Type guard for UserEvent.
 */
function isUserEvent(event: TranscriptEvent): event is UserEvent {
  return event.type === "user";
}

/**
 * Type guard for AssistantEvent.
 */
function isAssistantEvent(event: TranscriptEvent): event is AssistantEvent {
  return event.type === "assistant";
}

/**
 * Type guard for ToolResultEvent.
 */
function isToolResultEvent(event: TranscriptEvent): event is ToolResultEvent {
  return event.type === "tool_result";
}

/**
 * Sanitize a transcript event, redacting sensitive data from content.
 *
 * Returns a new event object (does not mutate the original).
 * Preserves event structure, IDs, and metadata.
 *
 * @param event - Transcript event to sanitize
 * @param sanitizer - Optional custom sanitizer function (defaults to default patterns)
 * @returns New event object with sanitized content
 *
 * @example
 * ```typescript
 * const event = {
 *   id: "msg_1",
 *   type: "user",
 *   edit: { message: { role: "user", content: "Email: user@test.com" } }
 * };
 *
 * const sanitized = sanitizeTranscriptEvent(event);
 * // sanitized.edit.message.content === "Email: [REDACTED_EMAIL]"
 * ```
 */
export function sanitizeTranscriptEvent<T extends TranscriptEvent>(
  event: T,
  sanitizer: SanitizerFunction = createSanitizer(),
): T {
  if (isUserEvent(event)) {
    return {
      ...event,
      edit: {
        ...event.edit,
        message: {
          ...event.edit.message,
          content: sanitizer(event.edit.message.content),
        },
      },
    } as T;
  }

  if (isAssistantEvent(event)) {
    return {
      ...event,
      edit: {
        ...event.edit,
        message: {
          ...event.edit.message,
          content: sanitizer(event.edit.message.content),
        },
      },
    } as T;
  }

  if (isToolResultEvent(event)) {
    // Only sanitize if result is a string
    if (typeof event.result === "string") {
      return {
        ...event,
        result: sanitizer(event.result),
      } as T;
    }
    // Non-string results are returned unchanged
    return { ...event } as T;
  }

  // For unknown event types, return a shallow copy unchanged
  return { ...event };
}

/**
 * Create a sanitizer from output sanitization config.
 *
 * This is a factory function that handles the common pattern of building
 * a sanitizer from the output.sanitization config section. It validates
 * custom patterns, applies fuzz testing, and returns a configured sanitizer.
 *
 * @param sanitizationConfig - The sanitization config from output.sanitization
 * @returns A sanitizer function, or undefined if no config provided
 *
 * @example
 * ```typescript
 * const sanitizer = createSanitizerFromOutputConfig(config.output.sanitization);
 * if (sanitizer) {
 *   const clean = sanitizer("sk-ant-api03-xxx");
 *   // "[REDACTED_ANTHROPIC_KEY]"
 * }
 * ```
 */
export function createSanitizerFromOutputConfig(
  sanitizationConfig: OutputSanitizationConfig | undefined,
): SanitizerFunction | undefined {
  if (!sanitizationConfig) {
    return undefined;
  }

  const skipSafetyCheck =
    sanitizationConfig.pattern_safety_acknowledged ?? false;
  // Extract config values (these have defaults in the Zod schema)
  const fuzzTimeoutMs = sanitizationConfig.pattern_fuzz_timeout_ms;
  const maxInputLength = sanitizationConfig.max_input_length;

  const customPatterns = sanitizationConfig.custom_patterns?.map(
    (p, index) => ({
      name: `custom_${String(index)}`,
      pattern: validateRegexPattern(
        p.pattern,
        `custom_patterns[${String(index)}]`,
        // Only include fuzzTimeoutMs if defined (exactOptionalPropertyTypes)
        fuzzTimeoutMs !== undefined
          ? { skipSafetyCheck, fuzzTimeoutMs }
          : { skipSafetyCheck },
      ),
      replacement: p.replacement,
    }),
  );

  // Build sanitizer options, only including maxInputLength if defined
  const sanitizerOptions =
    maxInputLength !== undefined
      ? { enabled: true as const, maxInputLength }
      : { enabled: true as const };

  // Only pass patterns if they exist to satisfy exactOptionalPropertyTypes
  if (customPatterns && customPatterns.length > 0) {
    return createSanitizer({
      ...sanitizerOptions,
      patterns: customPatterns,
      mergeWithDefaults: true,
    });
  }

  return createSanitizer(sanitizerOptions);
}
