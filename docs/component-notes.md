# Component-Specific Notes

## Hooks

Enable: `scope.hooks: true`

Hooks use the `EventType::Matcher` format (e.g., "PreToolUse::Write|Edit"). Detection happens via `SDKHookResponseMessage` events with 100% confidence. Scenarios are generated deterministically via tool-to-prompt mapping.

**Limitation**: Session lifecycle hooks (SessionStart, SessionEnd) fire once per session.

## MCP Servers

Enable: `scope.mcp_servers: true`

Tools are detected via the pattern `mcp__<server>__<tool>`. Scenarios are generated deterministically (zero LLM cost). The SDK auto-connects to servers defined in `.mcp.json`.

**Limitation**: Tool schemas are not validated.
