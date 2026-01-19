import { describe, it, expect, vi, beforeEach } from "vitest";

import { setupRateLimiter } from "../../../../../src/stages/2-generation/shared/rate-limiter-setup.js";
import type { GenerationConfig } from "../../../../../src/types/config.js";

// Mock dependencies
vi.mock("../../../../../src/utils/concurrency.js", () => ({
  createRateLimiter: vi.fn(() => {
    // Return a mock rate limiter function
    return async <T>(fn: () => Promise<T>): Promise<T> => {
      return fn();
    };
  }),
}));

vi.mock("../../../../../src/utils/logging.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Helper to create a config with optional overrides
function createConfig(
  overrides: Partial<GenerationConfig> = {},
): GenerationConfig {
  return {
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    temperature: 0.7,
    scenarios_per_component: 5,
    diversity: 0.5,
    reasoning_effort: "medium",
    semantic_variations: false,
    api_timeout_ms: 60000,
    requests_per_second: null,
    ...overrides,
  };
}

describe("setupRateLimiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when rate limiting is disabled", () => {
    it("returns null when requests_per_second is null", () => {
      const config = createConfig({ requests_per_second: null });
      const result = setupRateLimiter(config);

      expect(result).toBeNull();
    });

    it("returns null when requests_per_second is undefined", () => {
      const config = createConfig({ requests_per_second: undefined });
      const result = setupRateLimiter(config);

      expect(result).toBeNull();
    });

    it("does not log when rate limiting is disabled", async () => {
      const { logger } = await import("../../../../../src/utils/logging.js");

      const config = createConfig({ requests_per_second: null });
      setupRateLimiter(config);

      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe("when rate limiting is enabled", () => {
    it("returns a rate limiter function when requests_per_second is set", async () => {
      const { createRateLimiter } =
        await import("../../../../../src/utils/concurrency.js");

      const config = createConfig({ requests_per_second: 5 });
      const result = setupRateLimiter(config);

      expect(result).not.toBeNull();
      expect(createRateLimiter).toHaveBeenCalledWith(5);
    });

    it("logs rate limiting info when enabled", async () => {
      const { logger } = await import("../../../../../src/utils/logging.js");

      const config = createConfig({ requests_per_second: 10 });
      setupRateLimiter(config);

      expect(logger.info).toHaveBeenCalledWith(
        "Rate limiting enabled: 10 requests/second",
      );
    });

    it("handles fractional requests per second", async () => {
      const { createRateLimiter } =
        await import("../../../../../src/utils/concurrency.js");

      const config = createConfig({ requests_per_second: 0.5 });
      setupRateLimiter(config);

      expect(createRateLimiter).toHaveBeenCalledWith(0.5);
    });
  });

  describe("rate limiter function behavior", () => {
    it("rate limiter function invokes the provided function", async () => {
      const config = createConfig({ requests_per_second: 5 });
      const rateLimiter = setupRateLimiter(config);

      expect(rateLimiter).not.toBeNull();

      const mockFn = vi.fn().mockResolvedValue("result");
      const result = await rateLimiter!(mockFn);

      expect(mockFn).toHaveBeenCalled();
      expect(result).toBe("result");
    });
  });
});
