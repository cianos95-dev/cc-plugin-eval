# Task Completion Checklist

When completing a task in this project, run the following checks:

## Required Checks

1. **Type Check**

   ```bash
   npm run typecheck
   ```

   Must pass with no errors.

2. **Lint**

   ```bash
   npm run lint
   ```

   Must pass. Use `npm run lint:fix` to auto-fix issues.

3. **Tests**

   ```bash
   npm run test
   ```

   All tests must pass. Tests run in parallel with randomized order.

4. **Build**

   ```bash
   npm run build
   ```

   Must compile successfully.

## Optional Checks

1. **Format Check** (if touching many files)

   ```bash
   npm run format:check
   ```

   Use `npm run format` to fix formatting issues.

2. **Markdown Lint** (if editing markdown)

   ```bash
   markdownlint "*.md"
   ```

3. **YAML Lint** (if editing YAML files)

   ```bash
   uvx yamllint -c .yamllint.yml config.yaml
   ```

4. **GitHub Actions** (if editing workflows)

   ```bash
   actionlint .github/workflows/*.yml
   ```

## Commit Guidelines

- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Branch naming: `feature/desc`, `fix/desc`, `chore/desc`
- Prefer new commits over amending

## CI Behavior

- Tests run in parallel with randomized order
- 30-second timeout per test
- Failed tests retry twice before marking as failed
