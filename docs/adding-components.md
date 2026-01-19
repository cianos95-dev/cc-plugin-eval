# Adding a New Component Type

When adding support for a new plugin component type (e.g., a new kind of trigger):

1. Define types in `src/types/`
2. Create analyzer in `src/stages/1-analysis/`
3. Create scenario generator in `src/stages/2-generation/`
4. Add detector in `src/stages/4-evaluation/detection/` (create new file, add to `orchestrator.ts`)
5. Update `AnalysisOutput` in `src/types/state.ts`
6. Add to pipeline in `src/stages/{1,2,4}-*/index.ts`
7. Add state migration in `src/state/operations.ts` (provide defaults for legacy state)
8. Add tests

## State Migration

When adding new component types, update `migrateState()` in `src/state/operations.ts` to provide defaults (e.g., `hooks: legacyComponents.hooks ?? []`) so existing state files remain compatible.

## Resume Handlers

The CLI uses a handler map in `src/cli/commands/resume.ts` for stage-based resume. State files are stored at `results/<plugin-name>/<run-id>/state.json`.
