# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

cc-plugin-eval is a 4-stage evaluation framework for testing Claude Code plugin component triggering. It evaluates whether skills, agents, commands, hooks, and MCP servers correctly activate when expected.

**Requirements**: Node.js >= 20.0.0, Anthropic API key (in `.env` as `ANTHROPIC_API_KEY`)

## Quick Reference

```bash
# Verify everything works
npm run build && npm run lint && npm run typecheck && npm test

# Essential CLI commands
cc-plugin-eval run -p ./plugin           # Full pipeline
cc-plugin-eval run -p ./plugin --dry-run # Cost estimation only
cc-plugin-eval resume -r <run-id>        # Resume interrupted run
```

## Architecture

| Stage             | Purpose                                                   | Entry Point                        |
| ----------------- | --------------------------------------------------------- | ---------------------------------- |
| **1. Analysis**   | Parse plugin structure, extract triggers                  | `src/stages/1-analysis/index.ts`   |
| **2. Generation** | Create test scenarios (LLM + deterministic)               | `src/stages/2-generation/index.ts` |
| **3. Execution**  | Run scenarios via Claude Agent SDK with tool capture      | `src/stages/3-execution/index.ts`  |
| **4. Evaluation** | Programmatic detection first, LLM judge fallback, metrics | `src/stages/4-evaluation/index.ts` |

**SDK usage**: `@anthropic-ai/sdk` for LLM calls (Stages 2, 4), `@anthropic-ai/claude-agent-sdk` for execution (Stage 3).

## Documentation

### Task-Specific Guides (`docs/`)

| File                         | When to Read                                    |
| ---------------------------- | ----------------------------------------------- |
| `public-api.md`              | Using cc-plugin-eval as a library               |
| `code-navigation.md`         | Navigating this codebase with Serena            |
| `adding-components.md`       | Adding new plugin component types               |
| `component-notes.md`         | Hooks/MCP server specifics and limitations      |
| `ci-cd.md`                   | Understanding GitHub Actions workflows          |
| `github-workflows.md`        | Issue blocking relationships, GraphQL mutations |
| `implementation-patterns.md` | Error handling, type guards, concurrency        |

### Serena Memories (`.serena/memories/`)

| Memory                   | When to Read                                   |
| ------------------------ | ---------------------------------------------- |
| `suggested_commands`     | Build, lint, test commands                     |
| `codebase_structure`     | Directory layout and file organization         |
| `architecture_decisions` | Detection confidence levels, design rationales |
| `testing_patterns`       | Test framework details, fixtures, mocking      |
| `code_style`             | Code conventions and patterns                  |
| `task_completion`        | Verification checklist before completing tasks |

### Global Tool Guidance

Tool selection (Morph vs Serena) documented in `~/.claude/docs/tool-selection.md`.

## Key Patterns

- **Detection strategy**: Programmatic detection (100% confidence) → transcript patterns (80%) → LLM judge (60%)
- **Session strategy**: Default is `per_scenario` (one session per test scenario)
- **State migration**: When adding component types, update `migrateState()` in `src/state/operations.ts`
