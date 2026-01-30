# Code Navigation

Project-specific navigation patterns for cc-plugin-eval.

## Navigation Patterns

**Understanding a stage**: Use `get_symbols_overview` on the stage's `index.ts`, then `find_referencing_symbols` on the main export to see how it integrates with the pipeline.

**Refactoring types**: Use `find_referencing_symbols` on a type from `src/types/` to find all usages before making changes.

**Tracing detection logic**: Detection is in `src/stages/4-evaluation/detection/`. The flow is:

1. `detectAllComponents` (in `orchestrator.ts`)
2. `detectFromCaptures` (in `capture-detection.ts`)
3. Type-specific detectors (`agents.ts`, `commands.ts`, `hooks.ts`)

Agent detection uses SubagentStart/SubagentStop hooks. Use `find_symbol` to navigate this chain.

**Adding a new component type**: Follow the type through all four stages using `find_referencing_symbols` on similar component types (e.g., trace how `hooks` is handled to understand where to add `mcp_servers`).

## Serena Name Path Examples

| Pattern                                   | Matches                                     |
| ----------------------------------------- | ------------------------------------------- |
| `runEvaluation`                           | Any symbol named `runEvaluation`            |
| `enrichMcpServerStatus`                   | Function in `plugin-loader.ts`              |
| `/ClassName/method`                       | Absolute path (exact match required)        |
| `detect` (with `substring_matching`)      | `detectFromCaptures`, `detectAllComponents` |

## Key Parameters

| Parameter                       | Use Case                                               |
| ------------------------------- | ------------------------------------------------------ |
| `depth=1`                       | Get class methods: `find_symbol("ClassName", depth=1)` |
| `include_body=true`             | Get actual code (use sparingly)                        |
| `relative_path`                 | Restrict search scope for speed                        |
| `restrict_search_to_code_files` | In `search_for_pattern`, limits to TypeScript files    |

## Non-Code File Search

Use `search_for_pattern` (not `find_symbol`) for YAML, JSON, markdown:

```text
search_for_pattern("pattern", paths_include_glob="*.json")
```
