/**
 * Parsing utility functions for common data transformations.
 */

/**
 * Parses a value that can be either a delimited string or an array of strings.
 *
 * This utility handles the common pattern in plugin component frontmatter
 * where values like `allowed-tools` or `tools` can be specified as either:
 * - A delimited string: "Tool1, Tool2, Tool3"
 * - A YAML array: ["Tool1", "Tool2", "Tool3"]
 *
 * @param raw - The raw value (could be string, array, or undefined)
 * @param delimiter - The delimiter used for splitting strings (default: ",")
 * @returns An array of trimmed strings, or undefined if input is invalid
 *
 * @example
 * ```ts
 * parseStringOrArray("Read, Write, Bash"); // ["Read", "Write", "Bash"]
 * parseStringOrArray(["Read", "Write"]); // ["Read", "Write"]
 * parseStringOrArray(undefined); // undefined
 * parseStringOrArray(123); // undefined
 * ```
 */
export function parseStringOrArray(
  raw: unknown,
  delimiter = ",",
): string[] | undefined {
  if (typeof raw === "string") {
    return raw.split(delimiter).map((item) => item.trim());
  }

  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string");
  }

  return undefined;
}

/**
 * Extracts variable names from a string containing `${VAR}` patterns.
 *
 * This utility handles environment variable references commonly found in
 * plugin configuration files, such as MCP server headers or environment values.
 *
 * @param value - The string to extract variables from
 * @returns An array of variable names (without the `${` and `}` delimiters)
 *
 * @example
 * ```ts
 * extractVariablesFromString("Bearer ${API_KEY}"); // ["API_KEY"]
 * extractVariablesFromString("${HOST}:${PORT}"); // ["HOST", "PORT"]
 * extractVariablesFromString("no variables here"); // []
 * ```
 */
export function extractVariablesFromString(value: string): string[] {
  const matches = value.match(/\$\{([^}]+)\}/g);
  if (!matches) {
    return [];
  }
  return matches.map((match) => match.slice(2, -1));
}
