# 0001 — Build our own ADE rather than a plugin or fork

Date: 2026-11-04 · Status: accepted

## Context

Orca and T3 Code already run agent sessions, but they track sessions, not project work. We considered an Orca plugin
(custom editors can render full-size tabs, but planned task sources render in Orca's own UI and the plugin system is
alpha), contributing upstream (large external task-source PRs sit unmerged), and forking (both projects move too fast
to track).

## Decision

Build Featra as its own Electron ADE with project management built in. Vibecoders won't run a second app beside their
ADE, so the work view and the sessions must live in one app.

## Consequences

We own the session plumbing (provider adapters, worktrees, PR/CI) as well as the PM layer. M1 keeps plumbing minimal:
Claude only, local only.
