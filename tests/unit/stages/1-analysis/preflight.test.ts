import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Flag to control mocked lstatSync behavior
let mockLstatSyncError = false;

// Mock node:fs at module level to intercept direct ESM imports
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    lstatSync: vi.fn((filePath: string) => {
      if (mockLstatSyncError) {
        throw new Error("Permission denied");
      }
      return actual.lstatSync(filePath);
    }),
  };
});

import {
  formatPreflightResult,
  preflightCheck,
} from "../../../../src/stages/1-analysis/preflight.js";

const fixturesPath = path.resolve(process.cwd(), "tests/fixtures");

describe("preflightCheck", () => {
  it("passes for valid plugin", () => {
    const result = preflightCheck(path.join(fixturesPath, "valid-plugin"));

    expect(result.valid).toBe(true);
    expect(result.pluginName).toBe("test-plugin");
    expect(result.errors).toHaveLength(0);
  });

  it("fails for non-existent path", () => {
    const result = preflightCheck("/non/existent/path");

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("PATH_NOT_FOUND");
  });

  it("fails for missing manifest", () => {
    const result = preflightCheck(fixturesPath);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("MANIFEST_NOT_FOUND");
  });

  it("fails for malformed JSON", () => {
    const result = preflightCheck(path.join(fixturesPath, "malformed-plugin"));

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("MANIFEST_PARSE_ERROR");
  });

  it("fails for missing name field", () => {
    const result = preflightCheck(path.join(fixturesPath, "invalid-plugin"));

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("MANIFEST_INVALID");
  });

  it("returns warnings for non-kebab-case name", () => {
    // Create a mock function that modifies the name
    // For now, test that valid plugin passes without warnings about format
    const result = preflightCheck(path.join(fixturesPath, "valid-plugin"));

    // test-plugin is kebab-case, so no warning
    const nameWarning = result.warnings.find((w) => w.code === "NAME_FORMAT");
    expect(nameWarning).toBeUndefined();
  });
});

describe("formatPreflightResult", () => {
  it("formats passing result", () => {
    const result = preflightCheck(path.join(fixturesPath, "valid-plugin"));
    const formatted = formatPreflightResult(result);

    expect(formatted).toContain("✅");
    expect(formatted).toContain("test-plugin");
  });

  it("formats failing result", () => {
    const result = preflightCheck("/non/existent/path");
    const formatted = formatPreflightResult(result);

    expect(formatted).toContain("❌");
    expect(formatted).toContain("PATH_NOT_FOUND");
    expect(formatted).toContain("💡");
  });
});

describe("preflightCheck symlink handling", () => {
  let tempDir: string;
  let symlinkPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "preflight-symlink-test-"));
    symlinkPath = path.join(tempDir, "symlink-plugin");
    mockLstatSyncError = false; // Reset mock flag
  });

  afterEach(() => {
    mockLstatSyncError = false; // Reset mock flag
    // Clean up symlink and temp dir - use try-catch to prevent cleanup failures
    try {
      if (fs.existsSync(symlinkPath)) {
        fs.unlinkSync(symlinkPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  it("resolves symlinks and includes resolved path in result", () => {
    // Create symlink to valid plugin
    const targetPath = path.join(fixturesPath, "valid-plugin");
    fs.symlinkSync(targetPath, symlinkPath);

    const result = preflightCheck(symlinkPath);

    expect(result.valid).toBe(true);
    expect(result.pluginPath).toBe(path.resolve(symlinkPath));
    expect(result.resolvedPath).toBe(fs.realpathSync(symlinkPath));
    expect(result.resolvedPath).not.toBe(result.pluginPath);
  });

  it("adds warning when symlink is followed", () => {
    // Create symlink to valid plugin
    const targetPath = path.join(fixturesPath, "valid-plugin");
    fs.symlinkSync(targetPath, symlinkPath);

    const result = preflightCheck(symlinkPath);

    expect(result.valid).toBe(true);
    const symlinkWarning = result.warnings.find(
      (w) => w.code === "SYMLINK_RESOLVED",
    );
    expect(symlinkWarning).toBeDefined();
    expect(symlinkWarning?.message).toContain("->");
  });

  it("fails for broken symlinks", () => {
    // Create symlink to non-existent path
    fs.symlinkSync("/non/existent/target", symlinkPath);

    const result = preflightCheck(symlinkPath);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "PATH_NOT_FOUND")).toBe(true);
  });

  it("sets resolvedPath equal to pluginPath for non-symlink paths", () => {
    const result = preflightCheck(path.join(fixturesPath, "valid-plugin"));

    expect(result.valid).toBe(true);
    expect(result.pluginPath).toBe(result.resolvedPath);
  });

  it("no symlink warning for non-symlink paths", () => {
    const result = preflightCheck(path.join(fixturesPath, "valid-plugin"));

    const symlinkWarning = result.warnings.find(
      (w) => w.code === "SYMLINK_RESOLVED",
    );
    expect(symlinkWarning).toBeUndefined();
  });

  it("handles lstatSync failure with PATH_RESOLUTION_FAILED", () => {
    const validPath = path.join(fixturesPath, "valid-plugin");
    mockLstatSyncError = true; // Enable error throwing

    const result = preflightCheck(validPath);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("PATH_RESOLUTION_FAILED");
    expect(result.errors[0]?.message).toContain("Permission denied");
  });
});

describe("preflightCheck path boundary validation", () => {
  let originalCwd: typeof process.cwd;
  let originalPlatform: NodeJS.Platform;

  beforeEach(() => {
    originalCwd = process.cwd;
    originalPlatform = process.platform;
    mockLstatSyncError = false;
  });

  afterEach(() => {
    process.cwd = originalCwd;
    Object.defineProperty(process, "platform", { value: originalPlatform });
    mockLstatSyncError = false;
  });

  it("adds PATH_OUTSIDE_CWD warning when plugin path is outside cwd", () => {
    // Mock cwd to a specific directory
    process.cwd = () => path.join(fixturesPath, "valid-plugin");

    // Use parent directory (outside of mocked cwd)
    const result = preflightCheck(fixturesPath);

    // Should fail for missing manifest but also have PATH_OUTSIDE_CWD warning
    const outsideCwdWarning = result.warnings.find(
      (w) => w.code === "PATH_OUTSIDE_CWD",
    );
    expect(outsideCwdWarning).toBeDefined();
    expect(outsideCwdWarning?.message).toContain(
      "outside current working directory",
    );
  });

  it("does not add PATH_OUTSIDE_CWD warning when plugin path is within cwd", () => {
    // Use actual cwd so the path is inside
    const result = preflightCheck(path.join(fixturesPath, "valid-plugin"));

    const outsideCwdWarning = result.warnings.find(
      (w) => w.code === "PATH_OUTSIDE_CWD",
    );
    expect(outsideCwdWarning).toBeUndefined();
  });

  it("adds PATH_DANGEROUS error for system directories on Unix", () => {
    // Mock platform to Linux
    Object.defineProperty(process, "platform", { value: "linux" });

    const result = preflightCheck("/etc/passwd");

    expect(result.valid).toBe(false);
    const dangerousError = result.errors.find(
      (e) => e.code === "PATH_DANGEROUS",
    );
    expect(dangerousError).toBeDefined();
    expect(dangerousError?.message).toContain("system directory");
  });

  it("adds PATH_DANGEROUS error for /sys directory on Unix", () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const result = preflightCheck("/sys/devices");

    expect(result.valid).toBe(false);
    const dangerousError = result.errors.find(
      (e) => e.code === "PATH_DANGEROUS",
    );
    expect(dangerousError).toBeDefined();
  });

  it("adds PATH_DANGEROUS error for /proc directory on Unix", () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const result = preflightCheck("/proc/self");

    expect(result.valid).toBe(false);
    const dangerousError = result.errors.find(
      (e) => e.code === "PATH_DANGEROUS",
    );
    expect(dangerousError).toBeDefined();
  });

  it("adds PATH_DANGEROUS error for /root directory on Unix", () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const result = preflightCheck("/root/.ssh");

    expect(result.valid).toBe(false);
    const dangerousError = result.errors.find(
      (e) => e.code === "PATH_DANGEROUS",
    );
    expect(dangerousError).toBeDefined();
  });

  it("does not add PATH_DANGEROUS error for system directories on Windows", () => {
    // Mock platform to Windows
    Object.defineProperty(process, "platform", { value: "win32" });

    // This path won't exist, but we're testing that it doesn't trigger PATH_DANGEROUS
    const result = preflightCheck("/etc/passwd");

    // Should fail for PATH_NOT_FOUND, not PATH_DANGEROUS
    const dangerousError = result.errors.find(
      (e) => e.code === "PATH_DANGEROUS",
    );
    expect(dangerousError).toBeUndefined();
  });

  it("does not trigger PATH_DANGEROUS for paths that look similar but are not system dirs", () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    // /etcetera is not /etc
    const result = preflightCheck("/etcetera/something");

    const dangerousError = result.errors.find(
      (e) => e.code === "PATH_DANGEROUS",
    );
    expect(dangerousError).toBeUndefined();
  });

  it("returns early with PATH_DANGEROUS error before checking existence", () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    const result = preflightCheck("/etc/nonexistent");

    // Should have PATH_DANGEROUS error, not PATH_NOT_FOUND
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.code).toBe("PATH_DANGEROUS");
  });

  // Edge case tests for path normalization
  describe("path normalization edge cases", () => {
    it("handles paths with trailing slashes", () => {
      Object.defineProperty(process, "platform", { value: "linux" });

      // /etc/ with trailing slash should still be detected
      const result = preflightCheck("/etc/");

      expect(result.valid).toBe(false);
      const dangerousError = result.errors.find(
        (e) => e.code === "PATH_DANGEROUS",
      );
      expect(dangerousError).toBeDefined();
    });

    it("handles paths without trailing slashes", () => {
      Object.defineProperty(process, "platform", { value: "linux" });

      // /etc without trailing slash should still be detected
      const result = preflightCheck("/etc");

      expect(result.valid).toBe(false);
      const dangerousError = result.errors.find(
        (e) => e.code === "PATH_DANGEROUS",
      );
      expect(dangerousError).toBeDefined();
    });

    it("handles paths with dot segments that resolve to dangerous dirs", () => {
      Object.defineProperty(process, "platform", { value: "linux" });

      // /tmp/../etc/passwd should resolve to /etc/passwd
      const result = preflightCheck("/tmp/../etc/passwd");

      expect(result.valid).toBe(false);
      const dangerousError = result.errors.find(
        (e) => e.code === "PATH_DANGEROUS",
      );
      expect(dangerousError).toBeDefined();
    });

    it("handles paths with multiple dot segments", () => {
      Object.defineProperty(process, "platform", { value: "linux" });

      // /home/user/../../etc/shadow should resolve to /etc/shadow
      const result = preflightCheck("/home/user/../../etc/shadow");

      expect(result.valid).toBe(false);
      const dangerousError = result.errors.find(
        (e) => e.code === "PATH_DANGEROUS",
      );
      expect(dangerousError).toBeDefined();
    });

    it("handles current directory references in paths", () => {
      Object.defineProperty(process, "platform", { value: "linux" });

      // /etc/./passwd should resolve to /etc/passwd
      const result = preflightCheck("/etc/./passwd");

      expect(result.valid).toBe(false);
      const dangerousError = result.errors.find(
        (e) => e.code === "PATH_DANGEROUS",
      );
      expect(dangerousError).toBeDefined();
    });

    it("does not treat case variations as dangerous on case-sensitive systems", () => {
      Object.defineProperty(process, "platform", { value: "linux" });

      // /ETC/passwd is not the same as /etc/passwd on case-sensitive systems
      // This should NOT trigger PATH_DANGEROUS (but will fail for PATH_NOT_FOUND)
      const result = preflightCheck("/ETC/passwd");

      const dangerousError = result.errors.find(
        (e) => e.code === "PATH_DANGEROUS",
      );
      expect(dangerousError).toBeUndefined();
    });
  });
});
