/**
 * Tests for environment initialization module.
 *
 * Tests that dotenv is configured correctly with quiet mode
 * and that environment variables are loaded properly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Create a mock config function
const mockConfig = vi.fn();

// Mock dotenv before importing env.ts
vi.mock("dotenv", () => ({
  default: {
    config: mockConfig,
  },
  config: mockConfig,
}));

describe("env.ts", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset modules to ensure fresh import
    vi.resetModules();
    // Clone the original environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore the original environment
    process.env = originalEnv;
  });

  it("should call dotenv.config with quiet mode", async () => {
    // Import the env module to trigger initialization
    await import("../../src/env.js");

    expect(mockConfig).toHaveBeenCalledWith({ quiet: true });
  });

  it("should call dotenv.config exactly once", async () => {
    await import("../../src/env.js");

    expect(mockConfig).toHaveBeenCalledTimes(1);
  });

  it("should use quiet mode to suppress dotenv logs", async () => {
    await import("../../src/env.js");

    // Verify the quiet option is passed
    const configCall = mockConfig.mock.calls[0];
    expect(configCall[0]).toEqual({ quiet: true });
  });

  describe("environment variable handling", () => {
    it("should not throw if .env file is missing", async () => {
      // dotenv.config returns { error: ... } when file is missing,
      // but doesn't throw. With quiet: true, no warning is logged.
      mockConfig.mockReturnValue({
        error: new Error("ENOENT: no such file or directory"),
      });

      // Should not throw
      await expect(import("../../src/env.js")).resolves.not.toThrow();
    });

    it("should preserve existing environment variables", async () => {
      // Set an existing env var before import
      process.env.EXISTING_VAR = "preserved";

      await import("../../src/env.js");

      // Existing var should still be there
      expect(process.env.EXISTING_VAR).toBe("preserved");
    });
  });
});

describe("env.ts integration behavior", () => {
  it("should be imported before other modules in entry point", async () => {
    // Read the entry point and verify env.js is imported first
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const indexPath = path.resolve(import.meta.dirname, "../../src/index.ts");
    const indexContent = await fs.readFile(indexPath, "utf-8");

    // Find all import statements (including side-effect imports like `import "./env.js"`)
    const imports =
      indexContent.match(/^import\s+(?:.*\s+from\s+)?['"].*['"];?$/gm) || [];

    // env.js should be the first import
    expect(imports.length).toBeGreaterThan(0);
    expect(imports[0]).toContain("./env.js");
  });
});
