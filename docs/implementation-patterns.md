# Implementation Patterns

## Custom Error Classes

Use cause chains for error context. See `src/config/loader.ts:ConfigLoadError` for the pattern.

## Type Guards

Use type guards for tool detection in `src/stages/4-evaluation/detection/types.ts` and `capture-detection.ts`. Examples include `isSkillInput()` and `isTaskInput()`.

## Parallel Execution with Concurrency Control

Use `src/utils/concurrency.ts` for controlled parallel execution with progress callbacks. The utility handles error aggregation and respects concurrency limits.

## Retry Logic

Use `src/utils/retry.ts` for API calls. It implements exponential backoff with configurable max attempts and handles transient failures gracefully.

## Configuration Validation

All configuration uses Zod schemas in `src/config/`. The loader validates at runtime and provides clear error messages for invalid configuration.
