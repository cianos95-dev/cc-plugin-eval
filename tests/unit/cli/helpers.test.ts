import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { extractConfigPath, handleCLIError } from "../../../src/cli/helpers.js";
import { logger } from "../../../src/utils/logging.js";

// Mock the logger
vi.mock("../../../src/utils/logging.js", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("extractConfigPath", () => {
  it("returns config path when provided as string", () => {
    const options = { config: "./custom-config.yaml" };

    const result = extractConfigPath(options);

    expect(result).toBe("./custom-config.yaml");
  });

  it("returns undefined when config is not provided", () => {
    const options = {};

    const result = extractConfigPath(options);

    expect(result).toBeUndefined();
  });

  it("returns undefined when config is not a string", () => {
    const options = { config: 123 };

    const result = extractConfigPath(options);

    expect(result).toBeUndefined();
  });

  it("returns default path when config is not provided and default is specified", () => {
    const options = {};

    const result = extractConfigPath(options, "config.yaml");

    expect(result).toBe("config.yaml");
  });

  it("returns config path over default when both are available", () => {
    const options = { config: "./custom.yaml" };

    const result = extractConfigPath(options, "config.yaml");

    expect(result).toBe("./custom.yaml");
  });
});

describe("handleCLIError", () => {
  let mockExit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create a mock for process.exit that throws to prevent actual exit
    mockExit = vi.fn().mockImplementation(() => {
      throw new Error("process.exit called");
    });
    vi.stubGlobal("process", { ...process, exit: mockExit });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("logs error message when given an Error instance", () => {
    const error = new Error("Test error message");

    expect(() => handleCLIError(error)).toThrow("process.exit called");

    expect(logger.error).toHaveBeenCalledWith("Test error message");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("logs string representation when given a non-Error value", () => {
    expect(() => handleCLIError("String error")).toThrow("process.exit called");

    expect(logger.error).toHaveBeenCalledWith("String error");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("logs string representation for number errors", () => {
    expect(() => handleCLIError(42)).toThrow("process.exit called");

    expect(logger.error).toHaveBeenCalledWith("42");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("logs string representation for object errors", () => {
    expect(() => handleCLIError({ code: "ERR_FAILED" })).toThrow(
      "process.exit called",
    );

    expect(logger.error).toHaveBeenCalledWith("[object Object]");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("handles null error", () => {
    expect(() => handleCLIError(null)).toThrow("process.exit called");

    expect(logger.error).toHaveBeenCalledWith("null");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("handles undefined error", () => {
    expect(() => handleCLIError(undefined)).toThrow("process.exit called");

    expect(logger.error).toHaveBeenCalledWith("undefined");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("always calls process.exit with code 1", () => {
    expect(() => handleCLIError(new Error("Any error"))).toThrow(
      "process.exit called",
    );

    expect(mockExit).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
