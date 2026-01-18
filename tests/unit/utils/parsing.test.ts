import { describe, expect, it } from "vitest";

import { parseStringOrArray } from "../../../src/utils/parsing.js";

describe("parseStringOrArray", () => {
  describe("with string input", () => {
    it("parses comma-separated string into array", () => {
      expect(parseStringOrArray("Read, Write, Bash")).toEqual([
        "Read",
        "Write",
        "Bash",
      ]);
    });

    it("trims whitespace from each item", () => {
      expect(parseStringOrArray("  Tool1  ,  Tool2  ,  Tool3  ")).toEqual([
        "Tool1",
        "Tool2",
        "Tool3",
      ]);
    });

    it("handles single value string", () => {
      expect(parseStringOrArray("SingleTool")).toEqual(["SingleTool"]);
    });

    it("handles empty string", () => {
      expect(parseStringOrArray("")).toEqual([""]);
    });

    it("uses custom delimiter", () => {
      expect(parseStringOrArray("A|B|C", "|")).toEqual(["A", "B", "C"]);
    });

    it("handles semicolon delimiter", () => {
      expect(parseStringOrArray("x; y; z", ";")).toEqual(["x", "y", "z"]);
    });
  });

  describe("with array input", () => {
    it("returns array of strings unchanged", () => {
      expect(parseStringOrArray(["Read", "Write"])).toEqual(["Read", "Write"]);
    });

    it("filters out non-string values", () => {
      const mixed = ["Valid", 123, "AlsoValid", null, undefined, true];
      expect(parseStringOrArray(mixed)).toEqual(["Valid", "AlsoValid"]);
    });

    it("handles empty array", () => {
      expect(parseStringOrArray([])).toEqual([]);
    });

    it("handles array with only non-string values", () => {
      expect(parseStringOrArray([1, 2, 3])).toEqual([]);
    });
  });

  describe("with invalid input", () => {
    it("returns undefined for undefined input", () => {
      expect(parseStringOrArray(undefined)).toBeUndefined();
    });

    it("returns undefined for null input", () => {
      expect(parseStringOrArray(null)).toBeUndefined();
    });

    it("returns undefined for number input", () => {
      expect(parseStringOrArray(123)).toBeUndefined();
    });

    it("returns undefined for boolean input", () => {
      expect(parseStringOrArray(true)).toBeUndefined();
    });

    it("returns undefined for object input", () => {
      expect(parseStringOrArray({ key: "value" })).toBeUndefined();
    });
  });
});
