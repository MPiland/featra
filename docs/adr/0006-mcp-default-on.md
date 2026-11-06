# 0006 — Featra MCP on by default

Date: 2026-11-04 · Status: accepted

## Decision

Sessions get a local stdio MCP server (`draft_cards`, `update_card`, `spawn_session`, `ask_user`, `request_merge`) by
default, with a per-project off switch. Tool descriptions teach the card format; Featra injects no system prompt.

## Consequences

No hosted service and no token overhead beyond the tool definitions and the calls agents choose to make. Writes go
through the server, which enforces ownership (ADR 0002) and appends history.
