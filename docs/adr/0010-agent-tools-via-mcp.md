# 0010 — Agent tools through MCP, off by default

Date: 2026-11-05 · Status: accepted

## Context

Users want agents to use the in-app browser, and later the desktop. Building these into one provider's API would tie
them to Claude. Every tool definition also costs context tokens on every turn, and the product rule is zero token
overhead for features the user didn't turn on.

## Decision

Featra exposes agent tools as local MCP servers, so any MCP-capable agent can use them. Each is off by default and is
turned on per project or per chat:

- Browser use is STORY-40, in M1b.
- Desktop computer use is on the roadmap.

ADR 0006 (the Featra card MCP, on by default) is unaffected: its tools are what make delegation work.

## Consequences

- No provider-specific tool code.
- Settings need a per-project and per-chat tool switch.
- An agent driving the user's own panes must pause when the user takes over.
