# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-01-22

### Added

- **Query Termination**: `Query.close()` method for forceful query termination (#340)
- **Comprehensive Cost Tracking**: Stage-level cost breakdown in EvaluationOutput (#326)
- **Total Cost Aggregation**: All stage costs aggregated into total_cost_usd metric (#325)
- **Evaluation Stage Costs**: LLM costs tracked for both sync and batch modes (#324)
- **Generation Stage Costs**: LLM costs tracked during scenario generation (#323)
- **Cost Utility**: `calculateCostFromUsage` utility for SDK message responses (#322)
- **CLI Documentation**: Added CLI reference and improved help output (#315)

### Changed

- Updated Anthropic tooling versions
- Removed redundant top-level cost fields from EvaluationOutput (#328)
- Upgraded Claude Code Action workflows to Opus 4.5

### Fixed

- YAML null values normalized to undefined before config validation (#339)
- Execution cost estimation formula corrected (#332)
- Plugin load costs included in evaluation metrics total
- Plugin load API costs tracked in execution metrics (#331)
- All stage costs tracked in E2E tests
- Config files aligned with schema model defaults

## [0.3.0] - 2026-01-19

### Added

- **Session Batching**: Default execution strategy now batches scenarios by component,
  reducing subprocess overhead by ~80%. Configure `execution.session_strategy: "isolated"`
  to restore previous behavior (#82, #110)
- **Anthropic Batches API**: Stage 4 evaluation uses batch API for parallel LLM judge
  calls with automatic fallback to synchronous mode (#83)
- **Parallel LLM Generation**: Stage 2 scenario generation now parallelizes LLM calls
  for faster throughput (#81)
- **Prompt Caching**: Anthropic prompt caching for repeated system prompts reduces
  token costs (#136, #185)
- **Per-Model Cost Tracking**: Detailed cost breakdown by model with thinking token
  limits (#160)
- **SDK Resilience**: Retry-after-ms support, AbortController, configurable timeouts,
  typed error handling, and request ID preservation (#138, #140, #178, #179)
- **SubagentStart/SubagentStop Hooks**: Improved agent detection accuracy via new
  hook events (#192, #199)
- **PostToolUse Hook Capture**: Accurate tool success detection via PostToolUse
  events (#158, #189)
- **Zod Runtime Validation**: LLM judge responses validated with Zod schemas (#137)
- **Timing Instrumentation**: Detailed breakdown of SDK operation timing (#145)
- **Async File Operations**: Large state files handled asynchronously (#267)
- **Path Boundary Validation**: Preflight checks prevent directory traversal (#213)
- **Claude Code System Prompt**: Accurate plugin evaluation context (#212)
- **MCP Server Validation**: Server status verified after initialization (#159)
- **Defense-in-Depth ReDoS Protection**: Additional regex safeguards (#255)
- **Temperature Configuration**: Deterministic scenario generation option (#183)

### Changed

- Upgraded Claude Agent SDK from 0.1.76 to 0.2.9 (#109)
- Updated model pricing and default model selections (#181)
- Extracted shared tool capture hook logic into reusable utility (#191)
- Migrated SDK stderr callbacks to centralized logger (#147)
- Consolidated duplicate utility functions across stages (#257-265)
- Reduced cognitive complexity in 13 functions (#298)
- Extracted shared CLI error handling and option validation (#294)
- Broke circular import dependencies in types/state/config (#291)
- Decomposed large modules: programmatic-detector, evaluation/index, state-manager,
  CLI entry point (#268, #272-274)

### Fixed

- Plugin load error and SDK timeout warnings in E2E tests (#312)
- ReDoS vulnerabilities in regex patterns (#252)
- Rate limiter race condition under parallel execution (#157)
- Empty object type assertions replaced with invariant checks (#305)
- Runtime validation for unsafe type assertions (#217)
- Error handling consistency across pipeline stages (#218)
- AbortController interface alignment with SDK (#198)
- System prompt inclusion in batch evaluation requests (#182)
- System prompts included in token counting (#180)
- enableMcpDiscovery option for MCP channel timeout (#148)
- File checkpointing in batched session mode (#134)
- Double retry logic with Anthropic SDK eliminated (#80)

### Performance

- E2E test suite 93% faster (20min → 87s) via session batching and parallelism (#164, #175)
- Regex caching and rate limiting granularity optimizations (#222)
- Hook callback allocation optimized in batched execution mode (#221)
- Parallel independent SDK operations (#139)

### Security

- ReDoS vulnerabilities patched in custom sanitization patterns (#252)
- Defense-in-depth ReDoS protection layer added (#255)
- Path boundary validation prevents directory traversal attacks (#213)
- Inline security documentation for audit findings (#256)

## [0.2.0] - 2026-01-10

### Added

- MCP server evaluation with tool detection via `mcp__<server>__<tool>` pattern (#63)
- Hooks evaluation with SDKHookResponseMessage event detection (#58, #49)
- E2E integration tests with real Claude Agent SDK (#68)
- ReDoS protection for custom sanitization patterns (#66)

### Changed

- Modernized CI workflows with updated action versions (#64, #65)
- Updated dependencies: zod 4.3.5, glob 13.0.0 (#54, #55)
- Improved README and CLAUDE.md documentation (#69)

### Fixed

- CI not failing on codecov errors for Dependabot PRs
- CLI `--version` now reads from package.json instead of hardcoded value

## [0.1.0] - 2026-01-02

### Added

- Initial 4-stage evaluation pipeline (Analysis → Generation → Execution → Evaluation)
- Support for skills, agents, and commands evaluation
- Programmatic detection via tool capture parsing
- LLM judge for quality assessment with multi-sampling
- Resume capability with state checkpointing
- Cost estimation before execution (dry-run mode)
- Multiple output formats (JSON, YAML, JUnit XML, TAP)
- Semantic variation testing for trigger robustness
- Rate limiter for API call protection (#32)
- Symlink resolution for plugin path validation (#33)
- PII filtering for verbose transcript logging (#34)
- Custom sanitization regex pattern validation (#46)
- Comprehensive test suite with 943 tests and 93%+ coverage

### Changed

- Tuning configuration extracted from hardcoded values (#26)
- Renamed seed.yaml to config.yaml for clarity (#25)

### Fixed

- Correct Anthropic structured output API usage in LLM judge (#9)
- Variance propagation from runJudgment to metrics (#30)
- Centralized logger and pricing utilities (#43)

[Unreleased]: https://github.com/sjnims/cc-plugin-eval/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/sjnims/cc-plugin-eval/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/sjnims/cc-plugin-eval/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/sjnims/cc-plugin-eval/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/sjnims/cc-plugin-eval/releases/tag/v0.1.0
