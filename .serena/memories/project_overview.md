# cc-plugin-eval Project Overview

## Purpose

cc-plugin-eval is a 4-stage evaluation framework for testing Claude Code plugin component triggering. It evaluates whether skills, agents, commands, hooks, and MCP servers correctly activate when expected.

## Tech Stack

- **Runtime**: Node.js >= 20.0.0
- **Language**: TypeScript (ES2022, ESM modules)
- **Build**: tsc (TypeScript compiler)
- **Testing**: Vitest
- **Linting**: ESLint (flat config), Prettier
- **API Integration**:
  - @anthropic-ai/claude-agent-sdk (execution)
  - @anthropic-ai/sdk (LLM calls)
- **Configuration**: Zod for validation, YAML for config files
- **CLI**: Commander.js

## Key Dependencies

- `@anthropic-ai/claude-agent-sdk` - Claude Agent SDK for execution
- `@anthropic-ai/sdk` - Anthropic SDK for LLM calls
- `async-mutex` - Concurrency control for rate limiting
- `commander` - CLI framework
- `dotenv` - Environment variable loading
- `zod` - Runtime schema validation
- `yaml` - YAML parsing
- `chalk` - Terminal colors
- `nanoid` - ID generation
- `glob` - File pattern matching

## Requirements

- Node.js >= 20.0.0
- Anthropic API key (in `.env` as `ANTHROPIC_API_KEY`)
