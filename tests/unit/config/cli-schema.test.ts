import { describe, expect, it } from "vitest";

import {
  CLIOptionsSchema,
  extractCLIOptions,
} from "../../../src/config/cli-schema.js";

describe("CLIOptionsSchema", () => {
  describe("string options", () => {
    it("validates plugin as string", () => {
      const result = CLIOptionsSchema.parse({ plugin: "./my-plugin" });
      expect(result.plugin).toBe("./my-plugin");
    });

    it("validates marketplace as string", () => {
      const result = CLIOptionsSchema.parse({ marketplace: "./marketplace" });
      expect(result.marketplace).toBe("./marketplace");
    });

    it("validates failedRun as string", () => {
      const result = CLIOptionsSchema.parse({ failedRun: "run-123" });
      expect(result.failedRun).toBe("run-123");
    });
  });

  describe("boolean options", () => {
    it.each([
      "dryRun",
      "verbose",
      "debug",
      "fast",
      "estimate",
      "noBatch",
      "rewind",
      "semantic",
    ])("validates %s as boolean", (optionName) => {
      const result = CLIOptionsSchema.parse({ [optionName]: true });
      expect(result[optionName as keyof typeof result]).toBe(true);

      const resultFalse = CLIOptionsSchema.parse({ [optionName]: false });
      expect(resultFalse[optionName as keyof typeof resultFalse]).toBe(false);
    });

    it("rejects non-boolean for boolean options", () => {
      expect(() => CLIOptionsSchema.parse({ dryRun: "true" })).toThrow();
      expect(() => CLIOptionsSchema.parse({ verbose: 1 })).toThrow();
    });
  });

  describe("withPlugins transformation", () => {
    it("transforms comma-separated string to array", () => {
      const result = CLIOptionsSchema.parse({ withPlugins: "plugin1,plugin2" });
      expect(result.withPlugins).toEqual(["plugin1", "plugin2"]);
    });

    it("trims whitespace from plugin names", () => {
      const result = CLIOptionsSchema.parse({
        withPlugins: " plugin1 , plugin2 ",
      });
      expect(result.withPlugins).toEqual(["plugin1", "plugin2"]);
    });

    it("filters empty strings", () => {
      const result = CLIOptionsSchema.parse({
        withPlugins: "plugin1,,plugin2",
      });
      expect(result.withPlugins).toEqual(["plugin1", "plugin2"]);
    });

    it("returns undefined for empty string", () => {
      const result = CLIOptionsSchema.parse({ withPlugins: "" });
      expect(result.withPlugins).toBeUndefined();
    });

    it("returns undefined for whitespace-only string", () => {
      const result = CLIOptionsSchema.parse({ withPlugins: "   " });
      expect(result.withPlugins).toBeUndefined();
    });
  });

  describe("output format validation", () => {
    it.each(["json", "yaml", "junit-xml", "tap"])(
      "accepts valid output format: %s",
      (format) => {
        const result = CLIOptionsSchema.parse({ output: format });
        expect(result.output).toBe(format);
      },
    );

    it("rejects invalid output format", () => {
      expect(() => CLIOptionsSchema.parse({ output: "xml" })).toThrow();
      expect(() => CLIOptionsSchema.parse({ output: "csv" })).toThrow();
    });
  });

  describe("numeric options", () => {
    it("validates samples as positive integer", () => {
      const result = CLIOptionsSchema.parse({ samples: 5 });
      expect(result.samples).toBe(5);
    });

    it("validates reps as positive integer", () => {
      const result = CLIOptionsSchema.parse({ reps: 3 });
      expect(result.reps).toBe(3);
    });

    it("rejects non-positive samples", () => {
      expect(() => CLIOptionsSchema.parse({ samples: 0 })).toThrow();
      expect(() => CLIOptionsSchema.parse({ samples: -1 })).toThrow();
    });

    it("rejects non-positive reps", () => {
      expect(() => CLIOptionsSchema.parse({ reps: 0 })).toThrow();
      expect(() => CLIOptionsSchema.parse({ reps: -1 })).toThrow();
    });

    it("rejects non-integer samples", () => {
      expect(() => CLIOptionsSchema.parse({ samples: 5.5 })).toThrow();
    });

    it("rejects non-integer reps", () => {
      expect(() => CLIOptionsSchema.parse({ reps: 3.5 })).toThrow();
    });
  });

  describe("optional fields", () => {
    it("accepts empty object", () => {
      const result = CLIOptionsSchema.parse({});
      expect(result).toEqual({});
    });

    it("accepts partial options", () => {
      const result = CLIOptionsSchema.parse({
        plugin: "./my-plugin",
        verbose: true,
      });
      expect(result.plugin).toBe("./my-plugin");
      expect(result.verbose).toBe(true);
      expect(result.dryRun).toBeUndefined();
    });
  });
});

describe("extractCLIOptions", () => {
  it("extracts valid options", () => {
    const options = {
      plugin: "./my-plugin",
      dryRun: true,
      verbose: false,
      samples: 10,
    };

    const result = extractCLIOptions(options);

    expect(result.plugin).toBe("./my-plugin");
    expect(result.dryRun).toBe(true);
    expect(result.verbose).toBe(false);
    expect(result.samples).toBe(10);
  });

  it("transforms withPlugins from string to array", () => {
    const options = {
      withPlugins: "plugin1,plugin2,plugin3",
    };

    const result = extractCLIOptions(options);

    expect(result.withPlugins).toEqual(["plugin1", "plugin2", "plugin3"]);
  });

  it("filters out undefined values", () => {
    const options = {
      plugin: "./my-plugin",
    };

    const result = extractCLIOptions(options);

    expect(result).toEqual({ plugin: "./my-plugin" });
    expect(Object.keys(result)).toEqual(["plugin"]);
  });

  it("throws descriptive error for invalid options", () => {
    const options = {
      samples: -5,
    };

    expect(() => extractCLIOptions(options)).toThrow("Invalid CLI options:");
    expect(() => extractCLIOptions(options)).toThrow(/samples/);
  });

  it("throws error for invalid output format", () => {
    const options = {
      output: "invalid-format",
    };

    expect(() => extractCLIOptions(options)).toThrow("Invalid CLI options:");
    expect(() => extractCLIOptions(options)).toThrow(/output/);
  });

  it("handles all option types together", () => {
    const options = {
      plugin: "./my-plugin",
      marketplace: "./marketplace",
      dryRun: true,
      verbose: true,
      debug: false,
      fast: true,
      failedRun: "run-123",
      withPlugins: "p1,p2",
      output: "json",
      estimate: true,
      noBatch: false,
      rewind: true,
      semantic: true,
      samples: 5,
      reps: 3,
    };

    const result = extractCLIOptions(options);

    expect(result.plugin).toBe("./my-plugin");
    expect(result.marketplace).toBe("./marketplace");
    expect(result.dryRun).toBe(true);
    expect(result.verbose).toBe(true);
    expect(result.debug).toBe(false);
    expect(result.fast).toBe(true);
    expect(result.failedRun).toBe("run-123");
    expect(result.withPlugins).toEqual(["p1", "p2"]);
    expect(result.output).toBe("json");
    expect(result.estimate).toBe(true);
    expect(result.noBatch).toBe(false);
    expect(result.rewind).toBe(true);
    expect(result.semantic).toBe(true);
    expect(result.samples).toBe(5);
    expect(result.reps).toBe(3);
  });
});
