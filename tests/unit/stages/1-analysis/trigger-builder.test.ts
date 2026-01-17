/**
 * Unit tests for trigger-builder.ts
 */
import { describe, it, expect } from "vitest";
import { buildTriggerRecords } from "../../../../src/stages/1-analysis/trigger-builder.js";

describe("trigger-builder", () => {
  describe("buildTriggerRecords", () => {
    it("builds empty record from empty array", () => {
      const result = buildTriggerRecords([], (item) => [item, item]);
      expect(result).toEqual({});
    });

    it("builds record from array of items with simple mapping", () => {
      const items = [
        { name: "skill1", value: 1 },
        { name: "skill2", value: 2 },
      ];

      const result = buildTriggerRecords(items, (item) => [
        item.name,
        { val: item.value },
      ]);

      expect(result).toEqual({
        skill1: { val: 1 },
        skill2: { val: 2 },
      });
    });

    it("handles skill-like objects correctly", () => {
      const skills = [
        {
          name: "commit",
          trigger_phrases: ["commit changes", "save work"],
          description: "Creates a git commit",
        },
        {
          name: "review",
          trigger_phrases: ["review code"],
          description: "Reviews code changes",
        },
      ];

      const result = buildTriggerRecords(skills, (skill) => [
        skill.name,
        {
          triggers: skill.trigger_phrases,
          description: skill.description,
        },
      ]);

      expect(result).toEqual({
        commit: {
          triggers: ["commit changes", "save work"],
          description: "Creates a git commit",
        },
        review: {
          triggers: ["review code"],
          description: "Reviews code changes",
        },
      });
    });

    it("handles agent-like objects correctly", () => {
      const agents = [
        {
          name: "explore-agent",
          example_triggers: ["Find files", "Search codebase"],
          description: "Explores codebase",
        },
      ];

      const result = buildTriggerRecords(agents, (agent) => [
        agent.name,
        {
          examples: agent.example_triggers,
          description: agent.description,
        },
      ]);

      expect(result).toEqual({
        "explore-agent": {
          examples: ["Find files", "Search codebase"],
          description: "Explores codebase",
        },
      });
    });

    it("handles command-like objects with function transforms", () => {
      const commands = [
        { name: "test", prefix: "run" },
        { name: "build", prefix: "start" },
      ];

      const result = buildTriggerRecords(commands, (cmd) => [
        cmd.name,
        { invocation: `/${cmd.prefix}-${cmd.name}` },
      ]);

      expect(result).toEqual({
        test: { invocation: "/run-test" },
        build: { invocation: "/start-build" },
      });
    });

    it("handles hook-like objects with multiple properties", () => {
      const hooks = [
        {
          name: "block-writes",
          eventType: "PreToolUse",
          matcher: "Write|Edit",
          matchingTools: ["Write", "Edit"],
          expectedBehavior: "Block dangerous writes",
        },
      ];

      const result = buildTriggerRecords(hooks, (hook) => [
        hook.name,
        {
          eventType: hook.eventType,
          matcher: hook.matcher,
          matchingTools: hook.matchingTools,
          expectedBehavior: hook.expectedBehavior,
        },
      ]);

      expect(result).toEqual({
        "block-writes": {
          eventType: "PreToolUse",
          matcher: "Write|Edit",
          matchingTools: ["Write", "Edit"],
          expectedBehavior: "Block dangerous writes",
        },
      });
    });

    it("handles MCP server-like objects with nested transforms", () => {
      const mcpServers = [
        {
          name: "github-mcp",
          serverType: "sse" as const,
          authRequired: true,
          envVars: ["GITHUB_TOKEN"],
          tools: [{ name: "list_repos" }, { name: "create_issue" }],
        },
      ];

      const result = buildTriggerRecords(mcpServers, (mcp) => [
        mcp.name,
        {
          serverType: mcp.serverType,
          authRequired: mcp.authRequired,
          envVars: mcp.envVars,
          knownTools: mcp.tools.map((t) => t.name),
        },
      ]);

      expect(result).toEqual({
        "github-mcp": {
          serverType: "sse",
          authRequired: true,
          envVars: ["GITHUB_TOKEN"],
          knownTools: ["list_repos", "create_issue"],
        },
      });
    });

    it("overwrites duplicate keys with last value", () => {
      const items = [
        { name: "dup", value: 1 },
        { name: "dup", value: 2 },
      ];

      const result = buildTriggerRecords(items, (item) => [
        item.name,
        item.value,
      ]);

      expect(result).toEqual({ dup: 2 });
    });

    it("preserves type safety with explicit types", () => {
      interface Skill {
        name: string;
        triggers: string[];
      }
      interface TriggerInfo {
        phrases: string[];
      }

      const skills: Skill[] = [{ name: "test", triggers: ["run tests"] }];

      const result: Record<string, TriggerInfo> = buildTriggerRecords(
        skills,
        (skill) => [skill.name, { phrases: skill.triggers }],
      );

      expect(result.test.phrases).toEqual(["run tests"]);
    });
  });
});
