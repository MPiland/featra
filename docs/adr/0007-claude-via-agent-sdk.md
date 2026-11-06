# 0007 — Claude through the Agent SDK and the user's own `claude`

Date: 2026-11-04 · Status: accepted

## Context
Featra must run agents on the user's existing subscription without handling their credentials. The options were:
- the Messages API with an API key;
- the Agent SDK's bundled binary;
- the Agent SDK pointed at the user's installed `claude` (the T3 Code pattern).

The spike is in `docs/spike-claude-sdk.md`.

## Decision
Use `@anthropic-ai/claude-agent-sdk` with `pathToClaudeCodeExecutable` set to the user's installed `claude`. Keep the
SDK's default `settingSources` (user, project, local), so sessions behave like the user's own `claude`. Featra never
offers a login and never reads credential files.

## Consequences
- No credential handling and no hosted service.
- Anthropic's SDK terms make subscription use a grey area. An API-key provider is on the roadmap as a fallback.
- Provider code sits behind an adapter, so Codex and ACP agents (M2) plug in the same way.
