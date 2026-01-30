# Documentation Structure

## Root Documentation Files

| File | Audience | Purpose |
|------|----------|---------|
| `README.md` | Human developers | Project overview, quickstart, features |
| `CLAUDE.md` | AI assistants | Concise technical reference for coding tasks |
| `CONTRIBUTING.md` | Contributors | Development setup, code style, PR process |
| `CHANGELOG.md` | Users/maintainers | Version history (Keep a Changelog format) |
| `SECURITY.md` | Security-conscious users | Threat model, compliance, enterprise config |
| `CODE_OF_CONDUCT.md` | Community | Contributor Covenant 3.0 |

## docs/ Directory

| File | Purpose |
|------|---------|
| `public-api.md` | Programmatic API exports and usage |
| `adding-components.md` | Guide for adding new component types |
| `component-notes.md` | Hooks and MCP server specifics |
| `ci-cd.md` | GitHub Actions workflow overview |
| `issue-management.md` | GitHub issue blocking relationships (GraphQL) |
| `implementation-patterns.md` | Error handling, concurrency, retry patterns |
| `code-navigation.md` | Serena-specific navigation patterns |
| `cli.md` | Complete CLI reference |

## Audience Guidelines

### CLAUDE.md (AI Assistants)

- Tables for quick reference
- Terse descriptions, imperative tone
- Commands, file paths, code patterns
- Avoid prose explanations

### README.md (Humans)

- Progressive disclosure: overview → quickstart → details
- Complete sentences with context
- Visual elements (badges, diagrams)
- Standard Readme format

## Key Configuration to Document

When updating docs, verify these match `config.yaml`:

- `execution.session_strategy`: Default is `batched_by_component`
- `generation.model`: Default is `claude-sonnet-4-5-20250929`
- `execution.model`: Check current default
- `evaluation.model`: Check current default
- Coverage thresholds in CONTRIBUTING.md should match `vitest.config.ts`

## Common Documentation Issues

1. **Outdated defaults**: Config values change but docs lag behind
2. **Session strategy naming**: Use `batched_by_component` not `per_scenario`
3. **State directory**: Include all files when listing structure
4. **Config examples**: Ensure key names match actual schema
