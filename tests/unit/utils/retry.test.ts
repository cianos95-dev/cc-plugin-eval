import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import {
  calculateDelay,
  createRetryOptionsFromTuning,
  createRetryWrapper,
  extractRequestId,
  extractRetryAfter,
  formatErrorWithRequestId,
  isTransientError,
  withRetry,
} from "../../../src/utils/retry.js";
import { DEFAULT_TUNING } from "../../../src/config/defaults.js";

describe("isTransientError", () => {
  it("identifies rate limit errors", () => {
    const error = new Error("Rate limit exceeded");
    expect(isTransientError(error)).toBe(true);

    const error2 = new Error("Too many requests");
    expect(isTransientError(error2)).toBe(true);
  });

  it("identifies server errors", () => {
    const error = new Error("500 Internal Server Error");
    expect(isTransientError(error)).toBe(true);

    const error2 = new Error("502 Bad Gateway");
    expect(isTransientError(error2)).toBe(true);
  });

  it("identifies network errors", () => {
    const error = new Error("Network error");
    expect(isTransientError(error)).toBe(true);

    const error2 = new Error("ECONNRESET");
    expect(isTransientError(error2)).toBe(true);
  });

  it("identifies Anthropic-specific errors", () => {
    const error = new Error("API overloaded");
    expect(isTransientError(error)).toBe(true);
  });

  it("returns false for non-transient errors", () => {
    const error = new Error("Invalid API key");
    expect(isTransientError(error)).toBe(false);
  });

  it("checks status codes", () => {
    const error429 = { status: 429, message: "Error" };
    expect(isTransientError(error429)).toBe(true);

    const error500 = { statusCode: 500, message: "Error" };
    expect(isTransientError(error500)).toBe(true);

    const error400 = { status: 400, message: "Error" };
    expect(isTransientError(error400)).toBe(false);
  });
});

describe("calculateDelay", () => {
  it("calculates exponential backoff", () => {
    const options = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitterFactor: 0,
    };

    expect(calculateDelay(0, options)).toBe(1000);
    expect(calculateDelay(1, options)).toBe(2000);
    expect(calculateDelay(2, options)).toBe(4000);
  });

  it("caps at max delay", () => {
    const options = {
      maxRetries: 10,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
      jitterFactor: 0,
    };

    expect(calculateDelay(5, options)).toBe(5000);
    expect(calculateDelay(10, options)).toBe(5000);
  });
});

describe("withRetry", () => {
  it("returns result on success", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await withRetry(fn);

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Rate limit"))
      .mockResolvedValueOnce("success");

    const result = await withRetry(fn, {
      initialDelayMs: 10,
      maxRetries: 3,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after max retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Rate limit"));

    await expect(
      withRetry(fn, { maxRetries: 2, initialDelayMs: 10 }),
    ).rejects.toThrow("Rate limit");

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-transient errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid API key"));

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow(
      "Invalid API key",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry callback", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Rate limit"))
      .mockResolvedValueOnce("success");

    await withRetry(fn, { onRetry, initialDelayMs: 10 });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      expect.any(Error),
      1,
      expect.any(Number),
    );
  });

  it("uses default onRetry callback that logs with request ID", async () => {
    // Spy on console.warn to capture log output (logger.warn uses console.warn)
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const errorWithRequestId = new Anthropic.RateLimitError(
      429,
      {
        type: "error",
        error: { type: "rate_limit_error", message: "Rate limited" },
      },
      "Rate limited",
      new Headers({ "request-id": "req_default_test_123" }),
    );

    const fn = vi
      .fn()
      .mockRejectedValueOnce(errorWithRequestId)
      .mockResolvedValueOnce("success");

    // Don't provide onRetry - should use default
    await withRetry(fn, { initialDelayMs: 10, maxRetries: 3 });

    // Verify console.warn was called with request ID in message
    expect(warnSpy).toHaveBeenCalled();
    const logMessage = warnSpy.mock.calls[0]?.[0] as string;
    expect(logMessage).toContain("req_default_test_123");
    expect(logMessage).toContain("Retry attempt 1");

    warnSpy.mockRestore();
  });
});

describe("createRetryWrapper", () => {
  it("creates a reusable retry function", async () => {
    const retry = createRetryWrapper({ maxRetries: 2, initialDelayMs: 10 });
    const fn = vi.fn().mockResolvedValue("result");

    const result = await retry(fn);
    expect(result).toBe("result");
  });
});

describe("createRetryOptionsFromTuning", () => {
  it("creates retry options from DEFAULT_TUNING", () => {
    const options = createRetryOptionsFromTuning(DEFAULT_TUNING);

    expect(options.maxRetries).toBe(DEFAULT_TUNING.retry.max_retries);
    expect(options.initialDelayMs).toBe(
      DEFAULT_TUNING.timeouts.retry_initial_ms,
    );
    expect(options.maxDelayMs).toBe(DEFAULT_TUNING.timeouts.retry_max_ms);
    expect(options.backoffMultiplier).toBe(
      DEFAULT_TUNING.retry.backoff_multiplier,
    );
    expect(options.jitterFactor).toBe(DEFAULT_TUNING.retry.jitter_factor);
    expect(options.isRetryable).toBe(isTransientError);
  });

  it("creates retry options from custom tuning config", () => {
    const customTuning = {
      ...DEFAULT_TUNING,
      timeouts: {
        ...DEFAULT_TUNING.timeouts,
        retry_initial_ms: 500,
        retry_max_ms: 60000,
      },
      retry: {
        max_retries: 5,
        backoff_multiplier: 3,
        jitter_factor: 0.2,
      },
    };

    const options = createRetryOptionsFromTuning(customTuning);

    expect(options.maxRetries).toBe(5);
    expect(options.initialDelayMs).toBe(500);
    expect(options.maxDelayMs).toBe(60000);
    expect(options.backoffMultiplier).toBe(3);
    expect(options.jitterFactor).toBe(0.2);
  });

  it("preserves isRetryable function reference", () => {
    const options = createRetryOptionsFromTuning(DEFAULT_TUNING);

    expect(options.isRetryable).toBe(isTransientError);
    // Verify it works
    const error = new Error("Rate limit");
    expect(options.isRetryable?.(error)).toBe(true);
  });
});

describe("extractRetryAfter", () => {
  it("extracts retry-after-ms first (Anthropic preferred header)", () => {
    const error = {
      headers: {
        get: (name: string) => {
          if (name === "retry-after-ms") return "5000";
          if (name === "retry-after") return "10";
          return null;
        },
      },
      message: "Rate limit",
    };
    // Should use retry-after-ms (5000ms) not retry-after (10s = 10000ms)
    expect(extractRetryAfter(error)).toBe(5000);
  });

  it("extracts retry-after-ms from plain object headers", () => {
    const error = {
      headers: {
        "retry-after-ms": "3000",
        "retry-after": "10",
      },
      message: "Rate limit",
    };
    // Should use retry-after-ms (3000ms) not retry-after (10s = 10000ms)
    expect(extractRetryAfter(error)).toBe(3000);
  });

  it("falls back to retry-after when retry-after-ms is not present", () => {
    const error = {
      headers: {
        get: (name: string) => (name === "retry-after" ? "5" : null),
      },
      message: "Rate limit",
    };
    expect(extractRetryAfter(error)).toBe(5000); // 5 seconds in ms
  });

  it("validates retry-after-ms is within 0-60000ms range", () => {
    // Above range - should fall back to retry-after
    const errorAboveRange = {
      headers: {
        get: (name: string) => {
          if (name === "retry-after-ms") return "70000"; // Above 60000
          if (name === "retry-after") return "5";
          return null;
        },
      },
      message: "Rate limit",
    };
    expect(extractRetryAfter(errorAboveRange)).toBe(5000); // Falls back to retry-after

    // Negative - should fall back to retry-after
    const errorNegative = {
      headers: {
        get: (name: string) => {
          if (name === "retry-after-ms") return "-1000";
          if (name === "retry-after") return "3";
          return null;
        },
      },
      message: "Rate limit",
    };
    expect(extractRetryAfter(errorNegative)).toBe(3000); // Falls back to retry-after

    // At max boundary - should be accepted
    const errorAtMax = {
      headers: {
        get: (name: string) => {
          if (name === "retry-after-ms") return "60000";
          return null;
        },
      },
      message: "Rate limit",
    };
    expect(extractRetryAfter(errorAtMax)).toBe(60000);

    // At zero - should be accepted
    const errorAtZero = {
      headers: {
        get: (name: string) => {
          if (name === "retry-after-ms") return "0";
          return null;
        },
      },
      message: "Rate limit",
    };
    expect(extractRetryAfter(errorAtZero)).toBe(0);
  });

  it("handles invalid retry-after-ms gracefully", () => {
    const error = {
      headers: {
        get: (name: string) => {
          if (name === "retry-after-ms") return "invalid";
          if (name === "retry-after") return "5";
          return null;
        },
      },
      message: "Rate limit",
    };
    expect(extractRetryAfter(error)).toBe(5000); // Falls back to retry-after
  });

  it("extracts retry-after from error headers (seconds)", () => {
    const error = {
      headers: { "retry-after": "5" },
      message: "Rate limit",
    };
    expect(extractRetryAfter(error)).toBe(5000); // 5 seconds in ms
  });

  it("extracts retry-after from Anthropic SDK error structure", () => {
    // Anthropic SDK errors have headers as a Headers-like object
    const error = {
      status: 429,
      headers: {
        get: (name: string) => (name === "retry-after" ? "10" : null),
      },
      message: "Rate limit exceeded",
    };
    expect(extractRetryAfter(error)).toBe(10000);
  });

  it("returns null for missing retry-after header", () => {
    const error = {
      headers: {},
      message: "Error",
    };
    expect(extractRetryAfter(error)).toBeNull();
  });

  it("returns null for non-numeric retry-after", () => {
    const error = {
      headers: { "retry-after": "invalid" },
      message: "Error",
    };
    expect(extractRetryAfter(error)).toBeNull();
  });

  it("returns null when error has no headers", () => {
    const error = new Error("No headers");
    expect(extractRetryAfter(error)).toBeNull();
  });
});

describe("withRetry retry-after integration", () => {
  it("respects retry-after header from rate limit errors", async () => {
    const onRetry = vi.fn();
    const errorWithRetryAfter = Object.assign(new Error("Rate limit"), {
      status: 429,
      headers: { "retry-after": "10" }, // 10 seconds
    });

    const fn = vi
      .fn()
      .mockRejectedValueOnce(errorWithRetryAfter)
      .mockResolvedValueOnce("success");

    await withRetry(fn, {
      onRetry,
      initialDelayMs: 100, // Much less than retry-after
      maxRetries: 3,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    // Delay should be at least 10000ms (from retry-after)
    const [, , delay] = onRetry.mock.calls[0] as [unknown, unknown, number];
    expect(delay).toBeGreaterThanOrEqual(10000);
  });
});

describe("isTransientError with SDK error types", () => {
  it("identifies RateLimitError as transient", () => {
    const error = new Anthropic.RateLimitError(
      429,
      {
        type: "error",
        error: { type: "rate_limit_error", message: "Rate limited" },
      },
      "Rate limited",
      new Headers({ "request-id": "req_123" }),
    );
    expect(isTransientError(error)).toBe(true);
  });

  it("identifies InternalServerError as transient", () => {
    const error = new Anthropic.InternalServerError(
      500,
      {
        type: "error",
        error: { type: "server_error", message: "Internal error" },
      },
      "Internal server error",
      new Headers({ "request-id": "req_456" }),
    );
    expect(isTransientError(error)).toBe(true);
  });

  it("identifies APIConnectionError as transient", () => {
    const error = new Anthropic.APIConnectionError({
      message: "Network failed",
    });
    expect(isTransientError(error)).toBe(true);
  });

  it("identifies APIConnectionTimeoutError as transient", () => {
    const error = new Anthropic.APIConnectionTimeoutError({
      message: "Timeout",
    });
    expect(isTransientError(error)).toBe(true);
  });

  it("returns false for AuthenticationError (non-transient)", () => {
    const error = new Anthropic.AuthenticationError(
      401,
      {
        type: "error",
        error: { type: "authentication_error", message: "Invalid API key" },
      },
      "Invalid API key",
      new Headers({ "request-id": "req_789" }),
    );
    expect(isTransientError(error)).toBe(false);
  });

  it("returns false for BadRequestError (non-transient)", () => {
    const error = new Anthropic.BadRequestError(
      400,
      {
        type: "error",
        error: { type: "invalid_request_error", message: "Bad request" },
      },
      "Bad request",
      new Headers({ "request-id": "req_abc" }),
    );
    expect(isTransientError(error)).toBe(false);
  });

  it("returns false for PermissionDeniedError (non-transient)", () => {
    const error = new Anthropic.PermissionDeniedError(
      403,
      {
        type: "error",
        error: { type: "permission_error", message: "Permission denied" },
      },
      "Permission denied",
      new Headers({ "request-id": "req_def" }),
    );
    expect(isTransientError(error)).toBe(false);
  });

  it("identifies generic APIError with 5xx status as transient", () => {
    const error = new Anthropic.APIError(
      503,
      {
        type: "error",
        error: { type: "api_error", message: "Service unavailable" },
      },
      "Service unavailable",
      new Headers({ "request-id": "req_503" }),
    );
    expect(isTransientError(error)).toBe(true);
  });

  it("returns false for generic APIError with 4xx status (non-transient)", () => {
    const error = new Anthropic.APIError(
      422,
      {
        type: "error",
        error: { type: "api_error", message: "Unprocessable entity" },
      },
      "Unprocessable entity",
      new Headers({ "request-id": "req_422" }),
    );
    expect(isTransientError(error)).toBe(false);
  });
});

describe("extractRequestId", () => {
  it("extracts request ID from APIError", () => {
    const error = new Anthropic.RateLimitError(
      429,
      {
        type: "error",
        error: { type: "rate_limit_error", message: "Rate limited" },
      },
      "Rate limited",
      new Headers({ "request-id": "req_test_123" }),
    );
    expect(extractRequestId(error)).toBe("req_test_123");
  });

  it("extracts request ID from error with requestID property", () => {
    // Some SDK versions expose requestID directly
    const error = Object.assign(new Error("Test error"), {
      requestID: "req_direct_456",
    });
    expect(extractRequestId(error)).toBe("req_direct_456");
  });

  it("extracts request ID from headers get method", () => {
    const error = {
      headers: {
        get: (name: string) =>
          name === "request-id" ? "req_headers_789" : null,
      },
      message: "Error",
    };
    expect(extractRequestId(error)).toBe("req_headers_789");
  });

  it("returns null for errors without request ID", () => {
    const error = new Error("Plain error");
    expect(extractRequestId(error)).toBeNull();
  });

  it("returns null for non-error values", () => {
    expect(extractRequestId(null)).toBeNull();
    expect(extractRequestId(undefined)).toBeNull();
    expect(extractRequestId("string error")).toBeNull();
  });
});

describe("formatErrorWithRequestId", () => {
  it("formats error with request ID", () => {
    const error = new Anthropic.RateLimitError(
      429,
      {
        type: "error",
        error: { type: "rate_limit_error", message: "Rate limited" },
      },
      "Rate limited",
      new Headers({ "request-id": "req_format_123" }),
    );
    const formatted = formatErrorWithRequestId(error);
    expect(formatted).toContain("Rate limited");
    expect(formatted).toContain("req_format_123");
  });

  it("formats error without request ID", () => {
    const error = new Error("Plain error message");
    const formatted = formatErrorWithRequestId(error);
    expect(formatted).toBe("Plain error message");
    expect(formatted).not.toContain("[request:");
  });

  it("handles non-Error values", () => {
    expect(formatErrorWithRequestId("string error")).toBe("string error");
    expect(formatErrorWithRequestId(null)).toBe("null");
    expect(formatErrorWithRequestId(undefined)).toBe("undefined");
  });

  it("includes status code for APIError", () => {
    const error = new Anthropic.InternalServerError(
      500,
      {
        type: "error",
        error: { type: "server_error", message: "Server error" },
      },
      "Server error",
      new Headers({ "request-id": "req_status_456" }),
    );
    const formatted = formatErrorWithRequestId(error);
    expect(formatted).toContain("500");
    expect(formatted).toContain("req_status_456");
  });
});
