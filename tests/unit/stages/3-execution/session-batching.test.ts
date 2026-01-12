/**
 * Tests for session batching utilities.
 */

import { describe, expect, it } from "vitest";

import {
  groupScenariosByComponent,
  resolveSessionStrategy,
} from "../../../../src/stages/3-execution/session-batching.js";

import type {
  ExecutionConfig,
  TestScenario,
} from "../../../../src/types/index.js";

describe("session-batching", () => {
  describe("resolveSessionStrategy", () => {
    const createConfig = (
      overrides: Partial<ExecutionConfig> = {},
    ): ExecutionConfig => ({
      model: "claude-sonnet-4-20250514",
      max_turns: 5,
      timeout_ms: 60000,
      max_budget_usd: 10.0,
      session_isolation: true,
      permission_bypass: true,
      num_reps: 1,
      additional_plugins: [],
      ...overrides,
    });

    it("returns session_strategy when explicitly set to batched", () => {
      const config = createConfig({ session_strategy: "batched_by_component" });
      expect(resolveSessionStrategy(config)).toBe("batched_by_component");
    });

    it("returns isolated when session_strategy is set to isolated", () => {
      const config = createConfig({
        session_isolation: false, // Would map to batched, but explicit strategy takes precedence
        session_strategy: "isolated",
      });
      expect(resolveSessionStrategy(config)).toBe("isolated");
    });

    it("falls back to session_isolation: true -> isolated", () => {
      const config = createConfig({ session_isolation: true });
      expect(resolveSessionStrategy(config)).toBe("isolated");
    });

    it("falls back to session_isolation: false -> batched_by_component", () => {
      const config = createConfig({ session_isolation: false });
      expect(resolveSessionStrategy(config)).toBe("batched_by_component");
    });
  });

  describe("groupScenariosByComponent", () => {
    const createScenario = (
      id: string,
      componentRef: string,
    ): TestScenario => ({
      id,
      scenario_type: "positive",
      component_type: "skill",
      component_ref: componentRef,
      user_prompt: `Test prompt for ${id}`,
      expected_trigger: true,
      expected_component: componentRef,
    });

    it("groups scenarios by component_ref", () => {
      const scenarios: TestScenario[] = [
        createScenario("skill-1-a", "skill:my-skill"),
        createScenario("skill-1-b", "skill:my-skill"),
        createScenario("skill-2-a", "skill:other-skill"),
        createScenario("agent-1-a", "agent:my-agent"),
      ];

      const groups = groupScenariosByComponent(scenarios);

      expect(groups.size).toBe(3);
      expect(groups.get("skill:my-skill::")?.length).toBe(2);
      expect(groups.get("skill:other-skill::")?.length).toBe(1);
      expect(groups.get("agent:my-agent::")?.length).toBe(1);
    });

    it("includes plugin hash in group key", () => {
      const scenarios: TestScenario[] = [
        createScenario("skill-1-a", "skill:my-skill"),
        createScenario("skill-1-b", "skill:my-skill"),
      ];

      const groupsNoPlugins = groupScenariosByComponent(scenarios, []);
      const groupsWithPlugins = groupScenariosByComponent(scenarios, [
        "./plugin-a",
        "./plugin-b",
      ]);

      // Different keys due to plugin hash
      expect(groupsNoPlugins.get("skill:my-skill::")).toBeDefined();
      expect(
        groupsWithPlugins.get("skill:my-skill::./plugin-a|./plugin-b"),
      ).toBeDefined();
    });

    it("sorts plugin paths for consistent hashing", () => {
      const scenarios: TestScenario[] = [
        createScenario("skill-1-a", "skill:my-skill"),
      ];

      const groupsAB = groupScenariosByComponent(scenarios, [
        "./plugin-a",
        "./plugin-b",
      ]);
      const groupsBA = groupScenariosByComponent(scenarios, [
        "./plugin-b",
        "./plugin-a",
      ]);

      // Same key regardless of order
      const keyAB = Array.from(groupsAB.keys())[0];
      const keyBA = Array.from(groupsBA.keys())[0];
      expect(keyAB).toBe(keyBA);
    });

    it("returns empty map for empty scenarios", () => {
      const groups = groupScenariosByComponent([]);
      expect(groups.size).toBe(0);
    });

    it("groups single scenario correctly", () => {
      const scenarios: TestScenario[] = [
        createScenario("only-one", "skill:only-skill"),
      ];

      const groups = groupScenariosByComponent(scenarios);

      expect(groups.size).toBe(1);
      expect(groups.get("skill:only-skill::")).toEqual(scenarios);
    });
  });
});
