import { describe, expect, it } from "vitest";

import {
  calculateCacheSavings,
  calculateCost,
  calculateCostFromUsage,
  formatCost,
  getModelPricing,
  MODEL_PRICING,
} from "../../../src/config/pricing.js";

describe("getModelPricing", () => {
  it("returns pricing for known models", () => {
    const opusPricing = getModelPricing("claude-opus-4-5-20251101");
    expect(opusPricing.input).toBe(5.0);
    expect(opusPricing.output).toBe(25.0);

    const sonnetPricing = getModelPricing("claude-sonnet-4-5-20250929");
    expect(sonnetPricing.input).toBe(3.0);
    expect(sonnetPricing.output).toBe(15.0);
  });

  it("returns default pricing for unknown models", () => {
    const unknownPricing = getModelPricing("unknown-model");
    expect(unknownPricing.input).toBe(3.0);
    expect(unknownPricing.output).toBe(15.0);
  });
});

describe("calculateCost", () => {
  it("calculates cost for opus model", () => {
    // 1M input tokens at $5/M + 1M output tokens at $25/M = $30
    const cost = calculateCost(
      "claude-opus-4-5-20251101",
      1_000_000,
      1_000_000,
    );
    expect(cost).toBe(30);
  });

  it("calculates cost for smaller token counts", () => {
    // 10K input at $3/M + 5K output at $15/M
    // = 0.01 * 3 + 0.005 * 15 = 0.03 + 0.075 = 0.105
    const cost = calculateCost("claude-sonnet-4-5-20250929", 10_000, 5_000);
    expect(cost).toBeCloseTo(0.105);
  });

  it("handles zero tokens", () => {
    const cost = calculateCost("claude-sonnet-4-5-20250929", 0, 0);
    expect(cost).toBe(0);
  });
});

describe("formatCost", () => {
  it("formats small costs with 4 decimal places", () => {
    expect(formatCost(0.001)).toBe("$0.0010");
    expect(formatCost(0.0001)).toBe("$0.0001");
  });

  it("formats regular costs with 2 decimal places", () => {
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(10.0)).toBe("$10.00");
  });
});

describe("MODEL_PRICING", () => {
  it("contains expected models", () => {
    expect(MODEL_PRICING).toHaveProperty("claude-opus-4-6");
    expect(MODEL_PRICING).toHaveProperty("claude-sonnet-4-6");
    expect(MODEL_PRICING).toHaveProperty("claude-opus-4-5-20251101");
    expect(MODEL_PRICING).toHaveProperty("claude-opus-4-1-20250805");
    expect(MODEL_PRICING).toHaveProperty("claude-opus-4-20250514");
    expect(MODEL_PRICING).toHaveProperty("claude-sonnet-4-5-20250929");
    expect(MODEL_PRICING).toHaveProperty("claude-sonnet-4-20250514");
    expect(MODEL_PRICING).toHaveProperty("claude-haiku-4-5-20251001");
    expect(MODEL_PRICING).toHaveProperty("claude-haiku-3-5-20250929");
  });

  it("includes cache pricing for all models", () => {
    for (const [modelId, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.cache_creation).toBeDefined();
      expect(pricing.cache_read).toBeDefined();
      expect(pricing.cache_creation).toBeGreaterThan(pricing.input);
      expect(pricing.cache_read).toBeLessThan(pricing.input);
    }
  });
});

describe("calculateCacheSavings", () => {
  it("calculates savings from cache usage", () => {
    // With 10K cache creation tokens and 90K cache read tokens
    // Without caching: 100K * $3/M = $0.30
    // With caching: 10K * $3.75/M + 90K * $0.30/M = $0.0375 + $0.027 = $0.0645
    // Savings = $0.30 - $0.0645 = $0.2355
    const savings = calculateCacheSavings(
      10_000, // cache creation tokens
      90_000, // cache read tokens
      "claude-sonnet-4-5-20250929",
    );
    expect(savings).toBeGreaterThan(0);
    expect(savings).toBeCloseTo(0.2355, 2);
  });

  it("returns zero savings when no cache tokens", () => {
    const savings = calculateCacheSavings(0, 0, "claude-sonnet-4-5-20250929");
    expect(savings).toBe(0);
  });

  it("handles cache creation only (no reads)", () => {
    // Only creation tokens - should have negative "savings" (cost more)
    // Without caching: 10K * $3/M = $0.03
    // With caching: 10K * $3.75/M = $0.0375
    // Savings = $0.03 - $0.0375 = -$0.0075
    const savings = calculateCacheSavings(
      10_000, // cache creation tokens
      0, // cache read tokens
      "claude-sonnet-4-5-20250929",
    );
    expect(savings).toBeLessThan(0);
    expect(savings).toBeCloseTo(-0.0075, 4);
  });

  it("works with different models", () => {
    // Test with Opus 4.5
    const opusSavings = calculateCacheSavings(
      10_000,
      90_000,
      "claude-opus-4-5-20251101",
    );
    expect(opusSavings).toBeGreaterThan(0);

    // Test with Haiku 3.5
    const haikuSavings = calculateCacheSavings(
      10_000,
      90_000,
      "claude-haiku-3-5-20250929",
    );
    expect(haikuSavings).toBeGreaterThan(0);
  });
});

describe("calculateCostFromUsage", () => {
  it("calculates cost with input and output tokens only", () => {
    // 100K input at $3/M + 50K output at $15/M
    // = 0.1 * 3 + 0.05 * 15 = 0.30 + 0.75 = 1.05
    const cost = calculateCostFromUsage(
      { input_tokens: 100_000, output_tokens: 50_000 },
      "claude-sonnet-4-5-20250929",
    );
    expect(cost).toBeCloseTo(1.05);
  });

  it("calculates cost with cache creation tokens", () => {
    // 100K input at $3/M + 50K output at $15/M + 20K cache_creation at $3.75/M
    // = 0.30 + 0.75 + 0.075 = 1.125
    const cost = calculateCostFromUsage(
      {
        input_tokens: 100_000,
        output_tokens: 50_000,
        cache_creation_input_tokens: 20_000,
      },
      "claude-sonnet-4-5-20250929",
    );
    expect(cost).toBeCloseTo(1.125);
  });

  it("calculates cost with cache read tokens", () => {
    // 100K input at $3/M + 50K output at $15/M + 30K cache_read at $0.30/M
    // = 0.30 + 0.75 + 0.009 = 1.059
    const cost = calculateCostFromUsage(
      {
        input_tokens: 100_000,
        output_tokens: 50_000,
        cache_read_input_tokens: 30_000,
      },
      "claude-sonnet-4-5-20250929",
    );
    expect(cost).toBeCloseTo(1.059);
  });

  it("calculates cost with all token types", () => {
    // 100K input at $3/M + 50K output at $15/M + 20K cache_creation at $3.75/M + 30K cache_read at $0.30/M
    // = 0.30 + 0.75 + 0.075 + 0.009 = 1.134
    const cost = calculateCostFromUsage(
      {
        input_tokens: 100_000,
        output_tokens: 50_000,
        cache_creation_input_tokens: 20_000,
        cache_read_input_tokens: 30_000,
      },
      "claude-sonnet-4-5-20250929",
    );
    expect(cost).toBeCloseTo(1.134);
  });

  it("handles zero tokens", () => {
    const cost = calculateCostFromUsage(
      { input_tokens: 0, output_tokens: 0 },
      "claude-sonnet-4-5-20250929",
    );
    expect(cost).toBe(0);
  });

  it("handles null cache token fields", () => {
    // Same as input/output only case
    const cost = calculateCostFromUsage(
      {
        input_tokens: 100_000,
        output_tokens: 50_000,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
      "claude-sonnet-4-5-20250929",
    );
    expect(cost).toBeCloseTo(1.05);
  });

  it("handles undefined cache token fields", () => {
    // Same as input/output only case
    const cost = calculateCostFromUsage(
      {
        input_tokens: 100_000,
        output_tokens: 50_000,
        cache_creation_input_tokens: undefined,
        cache_read_input_tokens: undefined,
      },
      "claude-sonnet-4-5-20250929",
    );
    expect(cost).toBeCloseTo(1.05);
  });

  it("uses default pricing for unknown models", () => {
    // Default pricing: input $3/M, output $15/M, cache_creation $3.75/M, cache_read $0.30/M
    // 100K input + 50K output + 20K cache_creation + 30K cache_read
    // = 0.30 + 0.75 + 0.075 + 0.009 = 1.134
    const cost = calculateCostFromUsage(
      {
        input_tokens: 100_000,
        output_tokens: 50_000,
        cache_creation_input_tokens: 20_000,
        cache_read_input_tokens: 30_000,
      },
      "unknown-future-model",
    );
    expect(cost).toBeCloseTo(1.134);
  });

  it("works with different models", () => {
    const usage = {
      input_tokens: 100_000,
      output_tokens: 50_000,
      cache_creation_input_tokens: 20_000,
      cache_read_input_tokens: 30_000,
    };

    // Opus 4.5: input $5/M, output $25/M, cache_creation $6.25/M, cache_read $0.50/M
    // = 0.50 + 1.25 + 0.125 + 0.015 = 1.89
    const opusCost = calculateCostFromUsage(usage, "claude-opus-4-5-20251101");
    expect(opusCost).toBeCloseTo(1.89);

    // Haiku 3.5: input $0.80/M, output $4/M, cache_creation $1/M, cache_read $0.08/M
    // = 0.08 + 0.20 + 0.02 + 0.0024 = 0.3024
    const haikuCost = calculateCostFromUsage(
      usage,
      "claude-haiku-3-5-20250929",
    );
    expect(haikuCost).toBeCloseTo(0.3024);
  });
});
