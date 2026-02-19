import { describe, expect, it } from "vitest";

import {
  EvalConfigSchema,
  EvaluationConfigSchema,
  ExecutionConfigSchema,
  GenerationConfigSchema,
  SandboxConfigSchema,
  ScopeConfigSchema,
} from "../../../src/config/schema.js";

describe("ScopeConfigSchema", () => {
  it("applies default values", () => {
    const result = ScopeConfigSchema.parse({});

    expect(result.skills).toBe(true);
    expect(result.agents).toBe(true);
    expect(result.commands).toBe(true);
    expect(result.hooks).toBe(false);
    expect(result.mcp_servers).toBe(false);
  });

  it("allows overriding defaults", () => {
    const result = ScopeConfigSchema.parse({
      skills: false,
      hooks: true,
    });

    expect(result.skills).toBe(false);
    expect(result.hooks).toBe(true);
  });
});

describe("GenerationConfigSchema", () => {
  it("applies default values", () => {
    const result = GenerationConfigSchema.parse({});

    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.scenarios_per_component).toBe(5);
    expect(result.diversity).toBe(0.7);
    expect(result.reasoning_effort).toBe("medium");
    expect(result.temperature).toBe(0.3);
  });

  it("validates scenarios_per_component range", () => {
    expect(() =>
      GenerationConfigSchema.parse({ scenarios_per_component: 0 }),
    ).toThrow();
    expect(() =>
      GenerationConfigSchema.parse({ scenarios_per_component: 25 }),
    ).toThrow();

    const valid = GenerationConfigSchema.parse({ scenarios_per_component: 10 });
    expect(valid.scenarios_per_component).toBe(10);
  });

  it("validates diversity range", () => {
    expect(() => GenerationConfigSchema.parse({ diversity: -0.1 })).toThrow();
    expect(() => GenerationConfigSchema.parse({ diversity: 1.5 })).toThrow();

    const valid = GenerationConfigSchema.parse({ diversity: 0.5 });
    expect(valid.diversity).toBe(0.5);
  });

  it("validates reasoning_effort enum", () => {
    expect(() =>
      GenerationConfigSchema.parse({ reasoning_effort: "invalid" }),
    ).toThrow();

    const valid = GenerationConfigSchema.parse({ reasoning_effort: "high" });
    expect(valid.reasoning_effort).toBe("high");
  });

  it("validates temperature range", () => {
    expect(() => GenerationConfigSchema.parse({ temperature: -0.1 })).toThrow();
    expect(() => GenerationConfigSchema.parse({ temperature: 1.5 })).toThrow();

    const valid = GenerationConfigSchema.parse({ temperature: 0.0 });
    expect(valid.temperature).toBe(0.0);

    const validMax = GenerationConfigSchema.parse({ temperature: 1.0 });
    expect(validMax.temperature).toBe(1.0);
  });
});

describe("EvaluationConfigSchema", () => {
  it("applies default values", () => {
    const result = EvaluationConfigSchema.parse({});

    expect(result.model).toBe("claude-haiku-4-5-20251001");
    expect(result.max_tokens).toBe(4000);
    expect(result.detection_mode).toBe("programmatic_first");
    expect(result.reasoning_effort).toBe("low");
    expect(result.temperature).toBe(0.1);
  });

  it("validates temperature range", () => {
    expect(() => EvaluationConfigSchema.parse({ temperature: -0.1 })).toThrow();
    expect(() => EvaluationConfigSchema.parse({ temperature: 1.5 })).toThrow();

    const valid = EvaluationConfigSchema.parse({ temperature: 0.0 });
    expect(valid.temperature).toBe(0.0);

    const validMax = EvaluationConfigSchema.parse({ temperature: 1.0 });
    expect(validMax.temperature).toBe(1.0);
  });
});

describe("EvalConfigSchema", () => {
  it("validates complete configuration", () => {
    const config = {
      plugin: { path: "./my-plugin" },
    };

    const result = EvalConfigSchema.parse(config);

    expect(result.plugin.path).toBe("./my-plugin");
    expect(result.scope.skills).toBe(true);
    expect(result.generation.model).toBe("claude-sonnet-4-6");
    expect(result.dry_run).toBe(false);
  });

  it("rejects missing plugin path", () => {
    expect(() => EvalConfigSchema.parse({})).toThrow();
    expect(() => EvalConfigSchema.parse({ plugin: {} })).toThrow();
  });

  it("validates detection_mode enum", () => {
    const config = {
      plugin: { path: "./my-plugin" },
      evaluation: { detection_mode: "invalid" },
    };

    expect(() => EvalConfigSchema.parse(config)).toThrow();
  });

  it("accepts valid detection_mode", () => {
    const config = {
      plugin: { path: "./my-plugin" },
      evaluation: { detection_mode: "llm_only" },
    };

    const result = EvalConfigSchema.parse(config);
    expect(result.evaluation.detection_mode).toBe("llm_only");
  });
});

describe("SandboxConfigSchema", () => {
  it("accepts valid full config", () => {
    const result = SandboxConfigSchema.parse({
      enabled: true,
      auto_allow_bash_if_sandboxed: true,
      allow_unsandboxed_commands: false,
      network: {
        allowed_domains: ["example.com"],
        allow_unix_sockets: ["/tmp/sock"],
        allow_all_unix_sockets: false,
        allow_local_binding: true,
        http_proxy_port: 8080,
        socks_proxy_port: 1080,
      },
      ignore_violations: { bash: ["echo"] },
      enable_weaker_nested_sandbox: false,
      excluded_commands: ["rm"],
      ripgrep: { command: "/usr/bin/rg", args: ["--no-heading"] },
    });

    expect(result.enabled).toBe(true);
    expect(result.network?.allowed_domains).toEqual(["example.com"]);
    expect(result.ripgrep?.command).toBe("/usr/bin/rg");
  });

  it("accepts empty object (all fields optional)", () => {
    const result = SandboxConfigSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts partial config", () => {
    const result = SandboxConfigSchema.parse({ enabled: true });
    expect(result.enabled).toBe(true);
    expect(result.network).toBeUndefined();
  });

  it("rejects invalid enabled type", () => {
    expect(() => SandboxConfigSchema.parse({ enabled: "yes" })).toThrow();
  });

  it("rejects invalid network field types", () => {
    expect(() =>
      SandboxConfigSchema.parse({
        network: { allowed_domains: "not-an-array" },
      }),
    ).toThrow();
  });

  it("validates ripgrep requires command", () => {
    expect(() =>
      SandboxConfigSchema.parse({ ripgrep: { args: ["--no-heading"] } }),
    ).toThrow();
  });

  it("accepts ripgrep with only command", () => {
    const result = SandboxConfigSchema.parse({
      enabled: true,
      ripgrep: { command: "/usr/bin/rg" },
    });
    expect(result.ripgrep?.command).toBe("/usr/bin/rg");
    expect(result.ripgrep?.args).toBeUndefined();
  });

  it("accepts network with partial fields", () => {
    const result = SandboxConfigSchema.parse({
      network: { http_proxy_port: 9090 },
      enabled: true,
    });
    expect(result.network?.http_proxy_port).toBe(9090);
    expect(result.network?.allowed_domains).toBeUndefined();
  });

  it("requires enabled to be set when other fields are configured", () => {
    expect(() =>
      SandboxConfigSchema.parse({
        network: { allowed_domains: ["example.com"] },
      }),
    ).toThrow(/enabled must be explicitly set/);
  });

  it("accepts empty sandbox object", () => {
    const result = SandboxConfigSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts sandbox with only enabled field", () => {
    const result = SandboxConfigSchema.parse({ enabled: true });
    expect(result.enabled).toBe(true);
  });

  it("accepts sandbox with enabled: false and other fields", () => {
    const result = SandboxConfigSchema.parse({
      enabled: false,
      network: { allowed_domains: ["example.com"] },
    });
    expect(result.enabled).toBe(false);
  });
});

describe("ExecutionConfigSchema sandbox fields", () => {
  it("sandbox is undefined when omitted", () => {
    const result = ExecutionConfigSchema.parse({});
    expect(result.sandbox).toBeUndefined();
  });

  it("accepts sandbox config", () => {
    const result = ExecutionConfigSchema.parse({
      sandbox: { enabled: true },
    });
    expect(result.sandbox?.enabled).toBe(true);
  });

  it("accepts env config", () => {
    const result = ExecutionConfigSchema.parse({
      env: { NODE_ENV: "test", FOO: "bar" },
    });
    expect(result.env).toEqual({ NODE_ENV: "test", FOO: "bar" });
  });

  it("accepts cwd config", () => {
    const result = ExecutionConfigSchema.parse({
      cwd: "/tmp/workdir",
    });
    expect(result.cwd).toBe("/tmp/workdir");
  });

  it("accepts additional_directories config", () => {
    const result = ExecutionConfigSchema.parse({
      additional_directories: ["/extra/a", "/extra/b"],
    });
    expect(result.additional_directories).toEqual(["/extra/a", "/extra/b"]);
  });

  it("env, cwd, additional_directories are undefined when omitted", () => {
    const result = ExecutionConfigSchema.parse({});
    expect(result.env).toBeUndefined();
    expect(result.cwd).toBeUndefined();
    expect(result.additional_directories).toBeUndefined();
  });

  it("rejects invalid env values (non-string)", () => {
    expect(() => ExecutionConfigSchema.parse({ env: { KEY: 123 } })).toThrow();
  });

  it("rejects invalid additional_directories (non-array)", () => {
    expect(() =>
      ExecutionConfigSchema.parse({ additional_directories: "/single" }),
    ).toThrow();
  });
});
