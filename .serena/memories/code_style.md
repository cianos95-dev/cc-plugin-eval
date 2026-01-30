# Code Style and Conventions

## TypeScript Configuration

- **Target**: ES2022
- **Module**: NodeNext (ESM)
- **Strict Mode**: Maximum strictness enabled
  - `strict: true`, `noImplicitAny`, `strictNullChecks`
  - `noUnusedLocals`, `noUnusedParameters`
  - `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`

## ESLint Rules

### Type Safety (Strict)

- Explicit function return types required
- Explicit module boundary types required
- No unsafe any operations (error level)
- Unused vars allowed if prefixed with `_`

### Import Organization

- Groups: builtin → external → internal → parent → sibling → index → type
- Newlines between groups
- Alphabetical sorting within groups
- Type imports must use `import type { }` syntax
- No circular imports (max depth 10)

### Code Quality

- `max-depth`: 4 (warn)
- `complexity`: 20 (warn)
- `max-lines-per-function`: 150 (warn, excludes blanks/comments)
- No nested ternaries
- Always use curly braces
- Prefer const, no var
- Strict equality (`===`)

### Async/Await

- `require-await` enforced
- No floating promises
- Promise functions must be async
- Return await only in try-catch

## Naming Conventions

- **Files**: kebab-case (e.g., `skill-analyzer.ts`, `state-manager.ts`)
- **Types/Interfaces**: PascalCase (e.g., `AnalysisOutput`, `TestScenario`)
- **Functions/Variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE for true constants

## Formatting (Prettier)

- Uses Prettier defaults
- Applied to `src/**/*.ts` and `tests/**/*.ts`

## Test Files

- Relaxed TypeScript strictness (no unsafe checks, no return type requirements)
- Located in `tests/` directory, mirroring `src/` structure
- Test files use `.test.ts` suffix

## Markdown

- ATX-style headers (`# Header`)
- Dash for unordered lists
- 2-space indentation
- Fenced code blocks with language specifier
