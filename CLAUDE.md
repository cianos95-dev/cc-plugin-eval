# cc-plugin-eval

## MCP Tool Requirements (CRITICAL)

### Search (prefer in order)

| Tool                              | Use When                               |
| --------------------------------- | -------------------------------------- |
| Serena `find_symbol`              | Know the symbol name - TRY FIRST      |
| Serena `find_referencing_symbols` | Find all usages of a symbol            |
| Serena `get_symbols_overview`     | Understand file structure              |
| `rg "pattern"`                    | Regex/text patterns (not symbol-based) |
| Built-in `Grep` / `Glob`         | Fallback when above tools insufficient |

### Edit (prefer in order)

| Tool                         | Use When                           |
| ---------------------------- | ---------------------------------- |
| Serena `replace_symbol_body` | Replacing entire methods/functions |
| Serena `insert_after_symbol` | Adding new code after a symbol     |
| Built-in `Edit`              | All other edits                    |

> **Serena first, then rg/built-in tools.**

## Project Overview

4-stage evaluation framework testing Claude Code plugin component triggering (skills, agents, commands, hooks, MCP servers).

**Requirements**: Node.js >= 20.0.0, `ANTHROPIC_API_KEY` in `.env`

## Commands

```bash
npm run build && npm run lint && npm run typecheck && npm run format:check && npm run knip && npm test  # Verify
cc-plugin-eval run -p ./plugin           # Full pipeline
cc-plugin-eval run -p ./plugin --dry-run # Cost estimation
cc-plugin-eval resume -r <run-id>        # Resume run
```

## Architecture

| Stage         | Purpose                                     | Entry                              |
| ------------- | ------------------------------------------- | ---------------------------------- |
| 1. Analysis   | Parse plugin, extract triggers              | `src/stages/1-analysis/index.ts`   |
| 2. Generation | Create test scenarios (LLM + deterministic) | `src/stages/2-generation/index.ts` |
| 3. Execution  | Run via Claude Agent SDK with tool capture  | `src/stages/3-execution/index.ts`  |
| 4. Evaluation | Programmatic detection → LLM judge fallback | `src/stages/4-evaluation/index.ts` |

**SDKs**: `@anthropic-ai/sdk` (Stages 2, 4), `@anthropic-ai/claude-agent-sdk` (Stage 3)

## Documentation

- **Task guides**: `docs/*.md` - API usage, adding components, CI/CD, hooks/MCP notes
- **Serena memories**: `.serena/memories/` - architecture, testing, code style

## Key Patterns

- **Detection**: Programmatic (100%) → LLM judge (quality assessment fallback)
- **Sessions**: Default `batched_by_component` (scenarios sharing a component reuse session with `/clear`)
- **State migration**: Update `migrateState()` in `src/state/operations.ts` for new component types
