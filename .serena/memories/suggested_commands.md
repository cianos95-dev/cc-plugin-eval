# Suggested Commands for cc-plugin-eval

## Build & Development

```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Watch mode compilation
npm run clean          # Remove dist/ and coverage/
```

## Linting & Formatting

```bash
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier format
npm run format:check   # Prettier check only
npm run typecheck      # TypeScript type checking (tsc --noEmit)
npm run knip           # Dead code detection
npm run jscpd          # Copy-paste detection
npm run madge          # Circular dependency detection
```

## Testing

```bash
npm run test           # Run all tests (Vitest)
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report
npm run test:ui        # Visual test UI (opens browser)

# Single file
npx vitest run tests/unit/stages/1-analysis/skill-analyzer.test.ts

# Pattern matching
npx vitest run -t "SkillAnalyzer"

# E2E tests (requires API key, costs money)
RUN_E2E_TESTS=true npm test -- tests/e2e/
RUN_E2E_TESTS=true E2E_MAX_COST_USD=2.00 npm test -- tests/e2e/
```

## CLI Usage

```bash
cc-plugin-eval run -p ./plugin           # Full pipeline
cc-plugin-eval analyze -p ./plugin       # Stage 1 only
cc-plugin-eval generate -p ./plugin      # Stages 1-2
cc-plugin-eval execute -p ./plugin       # Stages 1-3
cc-plugin-eval run -p ./plugin --dry-run # Cost estimation only
cc-plugin-eval resume -r <run-id>        # Resume interrupted run
cc-plugin-eval run -p ./plugin --fast    # Re-run failed scenarios only
```

## Additional Linters

```bash
markdownlint "*.md"                                  # Markdown linting
uvx yamllint -c .yamllint.yml config.yaml .yamllint.yml  # YAML linting
actionlint .github/workflows/*.yml                   # GitHub Actions validation
```

## Git Workflow

```bash
git status             # Check changes
git diff               # View changes
git add -A && git commit -m "feat: description"   # Conventional commits
```

## macOS/Darwin Utilities

```bash
arch                   # Check architecture (arm64 or x86_64)
rg "pattern"           # Code search (ripgrep, preferred over grep)
jq                     # JSON processing
```
