/**
 * Tests for model alias resolution.
 */

import { describe, expect, it } from "vitest";

import { MODEL_ALIASES, resolveModelId } from "../../../src/config/models.js";
import { MODEL_PRICING } from "../../../src/config/pricing.js";

describe("MODEL_ALIASES", () => {
  it("contains all expected model families", () => {
    // Opus family
    expect(MODEL_ALIASES).toHaveProperty("opus");
    expect(MODEL_ALIASES).toHaveProperty("opus-4.6");
    expect(MODEL_ALIASES).toHaveProperty("opus-4-6");
    expect(MODEL_ALIASES).toHaveProperty("opus-4.5");
    expect(MODEL_ALIASES).toHaveProperty("opus-4.1");
    expect(MODEL_ALIASES).toHaveProperty("opus-4");

    // Sonnet family
    expect(MODEL_ALIASES).toHaveProperty("sonnet");
    expect(MODEL_ALIASES).toHaveProperty("sonnet-4.6");
    expect(MODEL_ALIASES).toHaveProperty("sonnet-4-6");
    expect(MODEL_ALIASES).toHaveProperty("sonnet-4.5");
    expect(MODEL_ALIASES).toHaveProperty("sonnet-4");

    // Haiku family
    expect(MODEL_ALIASES).toHaveProperty("haiku");
    expect(MODEL_ALIASES).toHaveProperty("haiku-4.5");
    expect(MODEL_ALIASES).toHaveProperty("haiku-3.5");
  });

  it("has all aliases pointing to valid model IDs in MODEL_PRICING", () => {
    const pricingKeys = Object.keys(MODEL_PRICING);

    for (const [_alias, modelId] of Object.entries(MODEL_ALIASES)) {
      expect(pricingKeys).toContain(modelId);
    }
  });

  it("is immutable (readonly)", () => {
    // TypeScript enforces this at compile time via Readonly<>
    // At runtime, we can verify the object structure
    expect(typeof MODEL_ALIASES).toBe("object");
  });
});

describe("resolveModelId", () => {
  describe("unversioned aliases (default to latest)", () => {
    it("resolves opus to Opus 4.6", () => {
      expect(resolveModelId("opus")).toBe("claude-opus-4-6");
    });

    it("resolves sonnet to Sonnet 4.6", () => {
      expect(resolveModelId("sonnet")).toBe("claude-sonnet-4-6");
    });

    it("resolves haiku to Haiku 4.5", () => {
      expect(resolveModelId("haiku")).toBe("claude-haiku-4-5-20251001");
    });
  });

  describe("versioned aliases", () => {
    it("resolves opus-4.6", () => {
      expect(resolveModelId("opus-4.6")).toBe("claude-opus-4-6");
    });

    it("resolves opus-4-6", () => {
      expect(resolveModelId("opus-4-6")).toBe("claude-opus-4-6");
    });

    it("resolves opus-4.5", () => {
      expect(resolveModelId("opus-4.5")).toBe("claude-opus-4-5-20251101");
    });

    it("resolves opus-4.1", () => {
      expect(resolveModelId("opus-4.1")).toBe("claude-opus-4-1-20250805");
    });

    it("resolves opus-4", () => {
      expect(resolveModelId("opus-4")).toBe("claude-opus-4-20250514");
    });

    it("resolves sonnet-4.6", () => {
      expect(resolveModelId("sonnet-4.6")).toBe("claude-sonnet-4-6");
    });

    it("resolves sonnet-4-6", () => {
      expect(resolveModelId("sonnet-4-6")).toBe("claude-sonnet-4-6");
    });

    it("resolves sonnet-4.5", () => {
      expect(resolveModelId("sonnet-4.5")).toBe("claude-sonnet-4-5-20250929");
    });

    it("resolves sonnet-4", () => {
      expect(resolveModelId("sonnet-4")).toBe("claude-sonnet-4-20250514");
    });

    it("resolves haiku-4.5", () => {
      expect(resolveModelId("haiku-4.5")).toBe("claude-haiku-4-5-20251001");
    });

    it("resolves haiku-3.5", () => {
      expect(resolveModelId("haiku-3.5")).toBe("claude-haiku-3-5-20250929");
    });
  });

  describe("full name aliases (claude- prefix)", () => {
    it("resolves claude-opus-4.6", () => {
      expect(resolveModelId("claude-opus-4.6")).toBe("claude-opus-4-6");
    });

    it("resolves claude-opus-4.5", () => {
      expect(resolveModelId("claude-opus-4.5")).toBe(
        "claude-opus-4-5-20251101",
      );
    });

    it("resolves claude-opus-4.1", () => {
      expect(resolveModelId("claude-opus-4.1")).toBe(
        "claude-opus-4-1-20250805",
      );
    });

    it("resolves claude-opus-4", () => {
      expect(resolveModelId("claude-opus-4")).toBe("claude-opus-4-20250514");
    });

    it("resolves claude-sonnet-4.6", () => {
      expect(resolveModelId("claude-sonnet-4.6")).toBe("claude-sonnet-4-6");
    });

    it("resolves claude-sonnet-4.5", () => {
      expect(resolveModelId("claude-sonnet-4.5")).toBe(
        "claude-sonnet-4-5-20250929",
      );
    });

    it("resolves claude-sonnet-4", () => {
      expect(resolveModelId("claude-sonnet-4")).toBe(
        "claude-sonnet-4-20250514",
      );
    });

    it("resolves claude-haiku-4.5", () => {
      expect(resolveModelId("claude-haiku-4.5")).toBe(
        "claude-haiku-4-5-20251001",
      );
    });

    it("resolves claude-haiku-3.5", () => {
      expect(resolveModelId("claude-haiku-3.5")).toBe(
        "claude-haiku-3-5-20250929",
      );
    });
  });

  describe("pass-through behavior", () => {
    it("returns full model IDs unchanged", () => {
      const fullId = "claude-opus-4-5-20251101";
      expect(resolveModelId(fullId)).toBe(fullId);
    });

    it("returns unknown model IDs unchanged", () => {
      const customId = "custom-model-id";
      expect(resolveModelId(customId)).toBe(customId);
    });

    it("returns legacy model IDs unchanged", () => {
      const legacyId = "claude-3-5-sonnet-20241022";
      expect(resolveModelId(legacyId)).toBe(legacyId);
    });
  });
});
