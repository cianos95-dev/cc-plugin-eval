/**
 * Array utility functions for common mathematical operations.
 */

/**
 * Calculates the sum of an array of numbers.
 *
 * @param numbers - Array of numbers to sum
 * @returns The sum of all numbers, or 0 for empty arrays
 *
 * @example
 * ```ts
 * sum([1, 2, 3, 4]); // 10
 * sum([]); // 0
 * sum([5]); // 5
 * ```
 */
export function sum(numbers: number[]): number {
  return numbers.reduce((acc, n) => acc + n, 0);
}

/**
 * Calculates the arithmetic mean (average) of an array of numbers.
 *
 * @param numbers - Array of numbers to average
 * @returns The average value, or 0 for empty arrays
 *
 * @example
 * ```ts
 * average([1, 2, 3, 4]); // 2.5
 * average([]); // 0
 * average([10]); // 10
 * ```
 */
export function average(numbers: number[]): number {
  if (numbers.length === 0) {
    return 0;
  }
  return sum(numbers) / numbers.length;
}

/**
 * Calculates the sum of values extracted from an array of items.
 *
 * @param items - Array of items to sum values from
 * @param getValue - Function to extract the numeric value from each item
 * @returns The sum of all extracted values, or 0 for empty arrays
 *
 * @example
 * ```ts
 * const scores = [{ value: 10 }, { value: 20 }, { value: 30 }];
 * sumBy(scores, (item) => item.value); // 60
 *
 * const results = [{ score: 5 }, { score: null }];
 * sumBy(results, (r) => r.score ?? 0); // 5
 * ```
 */
export function sumBy<T>(items: T[], getValue: (item: T) => number): number {
  return items.reduce((acc, item) => acc + getValue(item), 0);
}

/**
 * Calculates the average of values extracted from an array of items.
 *
 * @param items - Array of items to average values from
 * @param getValue - Function to extract the numeric value from each item
 * @returns The average of all extracted values, or 0 for empty arrays
 *
 * @example
 * ```ts
 * const results = [{ score: 10 }, { score: 20 }, { score: 30 }];
 * averageBy(results, (r) => r.score); // 20
 *
 * averageBy([], (r) => r.score); // 0
 * ```
 */
export function averageBy<T>(
  items: T[],
  getValue: (item: T) => number,
): number {
  if (items.length === 0) {
    return 0;
  }
  return sumBy(items, getValue) / items.length;
}
