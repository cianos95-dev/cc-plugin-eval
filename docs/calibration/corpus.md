# Claude Code Plugin Evaluation Corpus

Research conducted: 2025-01-20 (original) + 2025-01-24 (merged)

## Purpose

Calibration corpus for validating the Claude Code Plugin Evaluation Framework. This merged list combines two independent research efforts to maximize diversity across maturity levels, component types, trigger complexity, and domains.

**Critical goal**: Include plugins across the quality spectrum so the framework can demonstrate discrimination ability—correctly identifying high-quality vs. low-quality plugins with correlation to human expert judgment.

## Target Distribution

| Maturity     | Target    | Final  | Description                               |
| ------------ | --------- | ------ | ----------------------------------------- |
| Polished     | 5-7       | **7**  | Well-documented, tested, production-ready |
| Functional   | 8-10      | **10** | Works well, may lack polish or docs       |
| Rough        | 5-7       | **7**  | Has issues, incomplete, or inconsistent   |
| Experimental | 3-5       | **5**  | Early stage, unconventional, or quirky    |
| **Total**    | **21-29** | **29** |                                           |

## POLISHED (7 plugins)

Gold standard references for establishing baseline quality expectations.

| #   | Name                   | URL                                                                                                                   | Components                         | License       | Notes                                                          | Testing Value                                                |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | **code-review**        | [anthropics/claude-code/plugins/code-review](https://github.com/anthropics/claude-code/tree/main/plugins/code-review) | Command, 5 Agents                  | Anthropic     | Production PR review with confidence scoring                   | Multi-agent orchestration, complex triggers                  |
| 2   | **plugin-dev**         | [anthropics/claude-code/plugins/plugin-dev](https://github.com/anthropics/claude-code/tree/main/plugins/plugin-dev)   | Command, 3 Agents, 7 Skills        | Anthropic     | 8-phase guided workflow for creating plugins                   | Meta-plugin, comprehensive skill library                     |
| 3   | **feature-dev**        | [anthropics/claude-code/plugins/feature-dev](https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev) | Command, 3 Agents                  | Anthropic     | 7-phase structured development workflow                        | Agent sequencing patterns                                    |
| 4   | **anthropics/skills**  | [anthropics/skills](https://github.com/anthropics/skills)                                                             | Skills, document-skills            | Apache 2.0    | 40.2k★; production skills powering Claude.ai (PDF, DOCX, XLSX) | Skill frontmatter, progressive disclosure, bundled resources |
| 5   | **trailofbits/skills** | [trailofbits/skills](https://github.com/trailofbits/skills)                                                           | 16+ Skills                         | CC-BY-SA-4.0  | Security-focused: semgrep, variant-analysis, secure-contracts  | Domain-specific, multi-language (CodeQL, Python, Solidity)   |
| 6   | **flow-next**          | [gmickel/gmickel-claude-marketplace](https://github.com/gmickel/gmickel-claude-marketplace)                           | 6 Commands, Hooks                  | MIT           | v0.14.2, 409★, re-anchoring to prevent drift                   | Complex state management, multi-model review gates           |
| 7   | **wshobson/agents**    | [wshobson/agents](https://github.com/wshobson/agents)                                                                 | 72 plugins, 108 Agents, 129 Skills | Not specified | Three-tier model strategy (Opus/Sonnet/Haiku)                  | Massive scale, granular design principles                    |

## FUNCTIONAL (10 plugins)

Working implementations with varying documentation quality.

| #   | Name                          | URL                                                                                                                               | Components                                   | License       | Notes                                                  | Testing Value                                                         |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| 8   | **commit-commands**           | [anthropics/claude-code/plugins/commit-commands](https://github.com/anthropics/claude-code/tree/main/plugins/commit-commands)     | 3 Commands                                   | Anthropic     | Git workflow automation                                | Simple command triggers, baseline                                     |
| 9   | **security-guidance**         | [anthropics/claude-code/plugins/security-guidance](https://github.com/anthropics/claude-code/tree/main/plugins/security-guidance) | PreToolUse Hook                              | Anthropic     | 9 security pattern monitors                            | Hook-based detection patterns                                         |
| 10  | **hookify**                   | [anthropics/claude-code/plugins/hookify](https://github.com/anthropics/claude-code/tree/main/plugins/hookify)                     | 4 Commands, Agent, Skill                     | Anthropic     | Create custom hooks from conversation patterns         | Meta-hook creation, pattern analysis                                  |
| 11  | **ralph-wiggum**              | [anthropics/claude-code/plugins/ralph-wiggum](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)           | 2 Commands, Stop Hook                        | Anthropic     | Autonomous iteration loops                             | Stop hook intercept pattern                                           |
| 12  | **pr-review-toolkit**         | [anthropics/claude-code/plugins/pr-review-toolkit](https://github.com/anthropics/claude-code/tree/main/plugins/pr-review-toolkit) | Command, 6 Agents                            | Anthropic     | Specialized reviewers (comments, tests, errors, types) | Agent parameter passing                                               |
| 13  | **matsengrp/plugins**         | [matsengrp/plugins](https://github.com/matsengrp/plugins)                                                                         | 12 Agents, Command, Hook                     | Not specified | Scientific writing, LaTeX, code smell detection        | Domain-specific agents, macOS notifications hook                      |
| 14  | **claude-code-showcase**      | [ChrisWiles/claude-code-showcase](https://github.com/ChrisWiles/claude-code-showcase)                                             | 3 Skills, Agent, 3 Commands, 4 Hooks, MCP    | MIT           | JIRA integration, GitHub Actions, regex triggers       | Full stack example, complex trigger patterns                          |
| 15  | **everything-claude-code**    | [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code)                                             | 6+ Skills, 9+ Commands, Hooks, 9 Agents, MCP | MIT           | Anthropic hackathon winner                             | Compound conditions: `tool == "Edit" && tool_input.file_path matches` |
| 16  | **secondsky/claude-skills**   | [secondsky/claude-skills](https://github.com/secondsky/claude-skills)                                                             | 174 Skills, Commands                         | MIT           | Largest single-skill collection; YAML frontmatter      | Scale testing, token budget constraints (15k char limit)              |
| 17  | **cased/claude-code-plugins** | [cased/claude-code-plugins](https://github.com/cased/claude-code-plugins)                                                         | Skills (kit-cli, piglet)                     | MIT           | CLI tools, PostHog integration                         | Skill-only plugins, minimal but clean                                 |

## ROUGH (7 plugins)

Plugins with known issues, incomplete implementations, or inconsistencies. **Critical for discrimination testing.**

| #   | Name                                | URL                                                                                                                                             | Components                                            | License       | Notes                                                                 | Testing Value                                                                      |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 18  | **frontend-design**                 | [anthropics/claude-code/plugins/frontend-design](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design)                   | Skill only                                            | Anthropic     | Auto-invoked for frontend work                                        | Implicit trigger pattern, minimal structure                                        |
| 19  | **explanatory-output-style**        | [anthropics/claude-code/plugins/explanatory-output-style](https://github.com/anthropics/claude-code/tree/main/plugins/explanatory-output-style) | SessionStart Hook only                                | Anthropic     | Injects educational context                                           | Minimal hook-only plugin                                                           |
| 20  | **learning-output-style**           | [anthropics/claude-code/plugins/learning-output-style](https://github.com/anthropics/claude-code/tree/main/plugins/learning-output-style)       | SessionStart Hook only                                | Anthropic     | Requests user code contributions                                      | Simple hook, behavioral modification                                               |
| 21  | **claude-code-safety-net**          | [kenryu42/claude-code-safety-net](https://github.com/kenryu42/claude-code-safety-net)                                                           | Hooks (pre-command)                                   | Not specified | **Known bypasses documented**: tmp.sh, awk system(), Makefile editing | **Critical**: Tests evaluator discrimination on plugins with known vulnerabilities |
| 22  | **awesome-claude-plugins examples** | [GiladShoham/awesome-claude-plugins](https://github.com/GiladShoham/awesome-claude-plugins)                                                     | Example plugins (calculator, weather, translator)     | MIT           | 48★, template-style, validation script                                | Basic structure, JSON schema compliance                                            |
| 23  | **cbrake/claude-plugins**           | [cbrake/claude-plugins](https://github.com/cbrake/claude-plugins)                                                                               | Commands                                              | Not specified | v1.0.9, 71 commits, doc-driven-development                            | Command-only, documentation-first workflow                                         |
| 24  | **buildwithclaude**                 | [davepoon/buildwithclaude](https://github.com/davepoon/buildwithclaude)                                                                         | Agents (117), Commands (175), Hooks (28), Skills (26) | Not specified | Claims 20k+ plugins index; aggregator hub                             | Verify actual vs claimed scale; aggregation patterns                               |

## EXPERIMENTAL (5 plugins)

Early-stage, unconventional, or quirky implementations that test edge cases.

| #   | Name                            | URL                                                                     | Components                         | License       | Notes                                                        | Testing Value                                     |
| --- | ------------------------------- | ----------------------------------------------------------------------- | ---------------------------------- | ------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| 25  | **superpowers-lab**             | [obra/superpowers-lab](https://github.com/obra/superpowers-lab)         | 3 Skills                           | Not specified | Tmux control, duplicate detection, MCP CLI                   | Unconventional interactive CLI control            |
| 26  | **finding-duplicate-functions** | [obra/superpowers-lab](https://github.com/obra/superpowers-lab)         | Skill (part of superpowers-lab)    | Not specified | Two-phase LLM: Haiku categorization → Opus analysis          | Multi-model orchestration within skill            |
| 27  | **claude-code-mcp**             | [steipete/claude-code-mcp](https://github.com/steipete/claude-code-mcp) | MCP Server                         | Not specified | Agent-in-agent pattern, bypasses permissions                 | Meta-agent architecture                           |
| 28  | **homunculus**                  | [humanplane/homunculus](https://github.com/humanplane/homunculus)       | Commands, Skills, Subagents, Hooks | Not specified | Self-rewriting plugin; probabilistic skills (50-80% trigger) | Self-modifying behavior, probabilistic activation |
| 29  | **cupcake**                     | [eqtylab/cupcake](https://github.com/eqtylab/cupcake)                   | Hooks (governance policies)        | Not specified | OPA/Rego policy enforcement                                  | Policy-as-code, enterprise governance patterns    |

## Diversity Analysis

### Component Type Coverage

| Component       | Count | Example Plugins                                                                |
| --------------- | ----- | ------------------------------------------------------------------------------ |
| **Commands**    | 15+   | commit-commands, hookify, flow-next                                            |
| **Agents**      | 12+   | code-review (5), pr-review-toolkit (6), matsengrp (12), wshobson (108)         |
| **Skills**      | 10+   | plugin-dev (7), anthropics/skills, trailofbits/skills (16), secondsky (174)    |
| **Hooks**       | 8+    | security-guidance, ralph-wiggum, explanatory-output-style, safety-net, cupcake |
| **MCP Servers** | 3+    | claude-code-mcp, claude-code-showcase                                          |

### Trigger Pattern Diversity

| Pattern Type              | Complexity   | Example Plugins                                                           |
| ------------------------- | ------------ | ------------------------------------------------------------------------- | ---------- |
| Simple keywords           | Low          | commit-commands (`/commit`)                                               |
| Explicit pattern matching | Medium       | security-guidance (9 patterns)                                            |
| Context-based/implicit    | Medium       | frontend-design (auto-invoked)                                            |
| Regex-based               | High         | claude-code-showcase (`\\btest(?:s                                        | ing)?\\b`) |
| Compound conditions       | High         | everything-claude-code (`tool == "Edit" && tool_input.file_path matches`) |
| Conversation analysis     | High         | hookify (pattern extraction)                                              |
| Multi-phase workflows     | High         | plugin-dev (8-phase), feature-dev (7-phase)                               |
| Hook intercepts           | High         | ralph-wiggum (Stop), security-guidance (PreToolUse)                       |
| Probabilistic             | Experimental | homunculus (50-80% trigger rate)                                          |

### Scale Variation

| Scale                     | Plugin Count | Notes                                                 |
| ------------------------- | ------------ | ----------------------------------------------------- |
| Minimal (1-3 components)  | 8            | cased, cbrake, output-style hooks, frontend-design    |
| Small (4-10 components)   | 10           | commit-commands, security-guidance, hookify           |
| Medium (11-50 components) | 5            | claude-code-showcase, matsengrp, trailofbits          |
| Large (50+ components)    | 4            | wshobson (108 agents), secondsky (174 skills)         |
| Marketplace scale         | 2            | buildwithclaude (claimed 20k+), wshobson (72 plugins) |

### Domain Coverage

| Domain                | Plugins                                                       |
| --------------------- | ------------------------------------------------------------- |
| General development   | commit-commands, feature-dev, plugin-dev                      |
| Code review           | code-review, pr-review-toolkit                                |
| Security              | trailofbits/skills, security-guidance, claude-code-safety-net |
| Scientific writing    | matsengrp/plugins (LaTeX, academic)                           |
| Enterprise governance | cupcake (OPA/Rego policies)                                   |
| CLI tooling           | cased (kit-cli), superpowers-lab (tmux)                       |
| Meta/plugin creation  | plugin-dev, hookify, homunculus                               |

## Plugins with Known Issues (Discrimination Testing)

These plugins have documented problems valuable for validating the evaluator correctly identifies quality issues:

| Plugin                     | Known Issues                                                                          | Testing Value                                         |
| -------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **claude-code-safety-net** | Community-documented bypasses: tmp.sh execution, awk system() calls, Makefile editing | Evaluator should flag security bypass vulnerabilities |
| **homunculus**             | Probabilistic skill triggering (50-80% rate) creates inconsistent behavior            | Evaluator should flag unreliable trigger patterns     |
| **buildwithclaude**        | Claims 20k+ indexed plugins but actual content unverified                             | Evaluator should distinguish claimed vs actual scale  |
| **output-style hooks**     | Minimal implementation, behavioral modification only                                  | Evaluator should correctly classify as limited scope  |

## Recommended Testing Tiers

### Tier 1: Gold Standard Validation

Use to establish baseline expectations for polished plugins.

- `anthropics/skills` — Official production skills
- `trailofbits/skills` — Enterprise security domain
- `code-review` — Multi-agent orchestration
- `plugin-dev` — Comprehensive skill library

### Tier 2: Complexity Testing

Test complex trigger patterns, scale handling, multi-component orchestration.

- `claude-code-showcase` — Regex triggers, full stack
- `everything-claude-code` — Compound conditions
- `secondsky/claude-skills` — 174 skills scale
- `wshobson/agents` — 108 agents scale
- `flow-next` — State management, multi-model gates

### Tier 3: Discrimination Testing

Verify the framework correctly identifies quality issues.

- `claude-code-safety-net` — Known security bypasses
- `homunculus` — Probabilistic, self-modifying
- `buildwithclaude` — Claimed vs actual scale
- `output-style hooks` — Minimal implementations

### Tier 4: Edge Case Testing

Test unusual patterns, minimal implementations, unofficial behaviors.

- `superpowers-lab` — Tmux control, two-phase LLM
- `claude-code-mcp` — Agent-in-agent meta-architecture
- `cupcake` — OPA/Rego policy hooks
- `cased/cbrake` — Minimal skill/command-only

## Key Sources

| Source                | URL                                                                                               | Description                         |
| --------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Official plugins      | [anthropics/claude-code/plugins](https://github.com/anthropics/claude-code/tree/main/plugins)     | Anthropic reference implementations |
| Official skills       | [anthropics/skills](https://github.com/anthropics/skills)                                         | Production skills (40.2k★)          |
| Official directory    | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official)       | Curated directory (40+ plugins)     |
| Awesome list          | [ccplugins/awesome-claude-code-plugins](https://github.com/ccplugins/awesome-claude-code-plugins) | 116 plugins, 13 categories          |
| Community registry    | [claude-plugins.dev](https://claude-plugins.dev/)                                                 | Registry with CLI                   |
| Agent collection      | [wshobson/agents](https://github.com/wshobson/agents)                                             | 72 plugins, 108 agents              |
| Marketplace directory | [claudemarketplaces.com](https://claudemarketplaces.com/)                                         | Marketplace aggregator              |

## Evaluation Framework Integration Notes

### Trigger Accuracy Testing

Best plugins for testing trigger appropriateness:

- **Positive triggers**: commit-commands (simple), security-guidance (explicit patterns)
- **Negative triggers**: frontend-design (should NOT trigger for backend work)
- **Complex conditions**: everything-claude-code, claude-code-showcase
- **Edge cases**: homunculus (probabilistic), hookify (conversation analysis)

### Technical Accuracy Testing

Best plugins for testing information correctness:

- **Strong ground truth**: anthropics/skills (production-proven), trailofbits/skills (security expertise)
- **Domain-specific**: matsengrp (scientific writing), cupcake (OPA/Rego)
- **Potential issues**: safety-net (bypasses), buildwithclaude (unverified claims)

### Code Validity Testing

Best plugins for testing code examples:

- **TypeScript/JavaScript**: claude-code-showcase, flow-next
- **Python**: trailofbits/skills, matsengrp
- **Multi-language**: wshobson (129 skills across languages)
- **Minimal/none**: output-style hooks (no code examples)

### Completeness Testing

Best plugins for testing response depth:

- **Comprehensive**: plugin-dev (8-phase workflow documentation)
- **Specialized**: pr-review-toolkit (6 specialized agents)
- **Sparse**: cased, cbrake (minimal documentation)

## Next Steps

1. **Clone corpus locally**: Create local copies for offline analysis
2. **Generate plugin profiles**: Run analyzer on each plugin
3. **Create test scenarios**: 5-10 scenarios per plugin covering trigger/accuracy/validity/completeness
4. **Human baseline labeling**: Label 2-3 scenarios per plugin for LLM judge calibration
5. **Run evaluation pipeline**: Compare LLM judge scores to human labels
6. **Calculate correlation**: Target Spearman ρ ≥ 0.80 with human judgment
