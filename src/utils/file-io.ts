/**
 * File I/O utilities.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { nanoid } from "nanoid";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/**
 * Ensure a directory exists, creating it if necessary.
 *
 * @param dirPath - Path to directory
 */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Read a JSON file.
 *
 * @param filePath - Path to file
 * @returns Parsed JSON content
 * @throws Error if file doesn't exist or isn't valid JSON
 */
export function readJson(filePath: string): unknown {
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content) as unknown;
}

/**
 * Write a JSON file.
 *
 * @param filePath - Path to file
 * @param data - Data to write
 * @param pretty - Whether to format with indentation (default: true)
 */
export function writeJson(
  filePath: string,
  data: unknown,
  pretty = true,
): void {
  ensureDir(path.dirname(filePath));
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Ensure a directory exists asynchronously, creating it if necessary.
 *
 * @param dirPath - Path to directory
 */
export async function ensureDirAsync(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Write a JSON file asynchronously.
 *
 * Use for large files (state files, transcripts) that may block the event loop.
 * For small config files at startup, prefer the sync version.
 *
 * @param filePath - Path to file
 * @param data - Data to write
 * @param pretty - Whether to format with indentation (default: true)
 */
export async function writeJsonAsync(
  filePath: string,
  data: unknown,
  pretty = true,
): Promise<void> {
  await ensureDirAsync(path.dirname(filePath));
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await writeFile(filePath, content, "utf-8");
}

/**
 * Read a YAML file.
 *
 * @param filePath - Path to file
 * @returns Parsed YAML content
 * @throws Error if file doesn't exist or isn't valid YAML
 */
export function readYaml(filePath: string): unknown {
  const content = readFileSync(filePath, "utf-8");
  return parseYaml(content) as unknown;
}

/**
 * Write a YAML file.
 *
 * @param filePath - Path to file
 * @param data - Data to write
 */
export function writeYaml(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  const content = stringifyYaml(data);
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Read a text file.
 *
 * @param filePath - Path to file
 * @returns File content
 */
export function readText(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

/**
 * Write a text file.
 *
 * @param filePath - Path to file
 * @param content - Content to write
 */
export function writeText(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Parse YAML frontmatter from markdown content.
 *
 * @param content - Markdown content with optional frontmatter
 * @returns Parsed frontmatter and body
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
  const match = frontmatterRegex.exec(content);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const [, yamlContent, body] = match;

  try {
    const parsed: unknown = parseYaml(yamlContent ?? "");
    // parseYaml returns null for empty content, coalesce to empty object
    const frontmatter =
      parsed !== null && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    return { frontmatter, body: body ?? "" };
  } catch {
    return { frontmatter: {}, body: content };
  }
}

/**
 * Generate a unique run ID.
 *
 * Format: YYYYMMDD-HHMMSS-XXXX (timestamp + random suffix)
 *
 * @returns Unique run ID
 */
export function generateRunId(): string {
  const now = new Date();

  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  const randomPart = nanoid(4);

  return `${datePart}-${timePart}-${randomPart}`;
}

/**
 * Get the results directory for a run.
 *
 * @param pluginName - Plugin name
 * @param runId - Run ID
 * @returns Results directory path
 */
export function getResultsDir(pluginName: string, runId?: string): string {
  const baseDir = path.join(process.cwd(), "results", pluginName);

  if (runId) {
    return path.join(baseDir, runId);
  }

  return baseDir;
}
