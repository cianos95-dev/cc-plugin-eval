/**
 * Shared rate limiter setup for scenario generation.
 */
import { createRateLimiter } from "../../../utils/concurrency.js";
import { logger } from "../../../utils/logging.js";

import type { GenerationConfig } from "../../../types/config.js";

/**
 * Creates a rate limiter from generation config if rate limiting is enabled.
 *
 * @param config - Generation configuration containing requests_per_second
 * @returns A rate limiter function, or null if rate limiting is disabled
 */
export function setupRateLimiter(
  config: GenerationConfig,
): (<T>(fn: () => Promise<T>) => Promise<T>) | null {
  const rps = config.requests_per_second;
  const rateLimiter =
    rps !== null && rps !== undefined ? createRateLimiter(rps) : null;

  if (rateLimiter) {
    logger.info(`Rate limiting enabled: ${String(rps)} requests/second`);
  }

  return rateLimiter;
}
