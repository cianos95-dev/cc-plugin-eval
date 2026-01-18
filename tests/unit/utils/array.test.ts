import { describe, expect, it } from "vitest";

import { average, averageBy, sum, sumBy } from "../../../src/utils/array.js";

describe("sum", () => {
  it("returns 0 for empty array", () => {
    expect(sum([])).toBe(0);
  });

  it("returns the value for single element array", () => {
    expect(sum([5])).toBe(5);
  });

  it("sums multiple positive numbers", () => {
    expect(sum([1, 2, 3, 4])).toBe(10);
  });

  it("handles negative numbers", () => {
    expect(sum([-1, 2, -3, 4])).toBe(2);
  });

  it("handles floating point numbers", () => {
    expect(sum([0.1, 0.2, 0.3])).toBeCloseTo(0.6);
  });
});

describe("average", () => {
  it("returns 0 for empty array", () => {
    expect(average([])).toBe(0);
  });

  it("returns the value for single element array", () => {
    expect(average([10])).toBe(10);
  });

  it("calculates average of multiple numbers", () => {
    expect(average([1, 2, 3, 4, 5])).toBe(3);
  });

  it("handles non-integer averages", () => {
    expect(average([1, 2])).toBe(1.5);
  });

  it("handles negative numbers", () => {
    expect(average([-10, 10])).toBe(0);
  });
});

describe("sumBy", () => {
  it("returns 0 for empty array", () => {
    expect(sumBy([], (x) => x)).toBe(0);
  });

  it("sums values extracted from objects", () => {
    const items = [{ value: 10 }, { value: 20 }, { value: 30 }];
    expect(sumBy(items, (item) => item.value)).toBe(60);
  });

  it("handles nullable values with fallback", () => {
    const items = [
      { score: 5 },
      { score: null as number | null },
      { score: 10 },
    ];
    expect(sumBy(items, (r) => r.score ?? 0)).toBe(15);
  });

  it("works with computed values", () => {
    const items = [
      { a: 2, b: 3 },
      { a: 4, b: 5 },
    ];
    expect(sumBy(items, (item) => item.a * item.b)).toBe(26); // 6 + 20
  });
});

describe("averageBy", () => {
  it("returns 0 for empty array", () => {
    expect(averageBy([], (x) => x)).toBe(0);
  });

  it("calculates average of values extracted from objects", () => {
    const items = [{ score: 10 }, { score: 20 }, { score: 30 }];
    expect(averageBy(items, (item) => item.score)).toBe(20);
  });

  it("handles single item array", () => {
    const items = [{ value: 42 }];
    expect(averageBy(items, (item) => item.value)).toBe(42);
  });

  it("handles nullable values with fallback", () => {
    const items = [
      { quality_score: 8 },
      { quality_score: null as number | null },
      { quality_score: 10 },
    ];
    // With fallback to 0: (8 + 0 + 10) / 3 = 6
    expect(averageBy(items, (r) => r.quality_score ?? 0)).toBe(6);
  });
});
