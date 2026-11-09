# Architecture

This is a map of the code. The reasoning behind each choice is in the ADRs (`docs/adr/`), and the terms are defined in
[CONTEXT.md](../CONTEXT.md).

## Packages

Dependencies point one way, toward `work-format` (ADR 0011).

```
apps/desktop ──► packages/client ──► packages/work-format
      │                                   ▲
      └──► packages/server ───────────────┘
                  ▲
           packages/mcp (planned)
```

| Package                  | Job                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Must not                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `packages/work-format`   | Card parse and serialize, `history[]`, ownership, rollups, evidence, config. Pure functions.                                                                                                                                                                                                                                                                                                                                                           | Do I/O, or import React, Electron or Node APIs.                                        |
| `packages/client`        | The React UI: views, menus, shortcuts, settings pages. Reaches the platform through `FeatraBridge` (`bridge.ts`).                                                                                                                                                                                                                                                                                                                                      | Import Electron or Node, or call IPC directly.                                         |
| `apps/desktop`           | Electron main process and preload. Owns windows, tray, the app lifecycle, troubleshooting, settings storage and IPC.                                                                                                                                                                                                                                                                                                                                   | Hold domain rules. It calls `work-format` instead.                                     |
| `packages/server`        | The local server (ADRs 0012, 0015). Today: project setup (detect git and `.featra/`, `git init`, Featra init, the one-pass setup of STORY-42), the Work list from owner copies with its SQLite index and file watching, stale-copy apply and discard (ADR 0016), the card pane's reads and one-field edits at the owner copy (ADR 0017), and the chat session manager with the Claude provider adapter (ADR 0018). Planned: `gh`, more providers (M2). | Be reachable from outside 127.0.0.1, or import React, Electron, `client` or `desktop`. |
| `packages/mcp` (planned) | The stdio MCP bridge from agents to the server (ADRs 0006, 0010).                                                                                                                                                                                                                                                                                                                                                                                      | Write cards itself. All writes go through the server.                                  |
| `tooling`                | The quality gate's own code: the git hook installer and the tests that prove lint, format and the hook work (ADR 0014).                                                                                                                                                                                                                                                                                                                                | Ship in the app.                                                                       |

## Runtime

- **Electron main** starts the window, tray and menus. The renderer runs with context isolation and the sandbox on, and
  reaches the platform only through the preload's typed bridge.
- **The server** runs as a child process on Electron's Node runtime, forked by main on first use and restarted on the
  next use if it exits. The preload's client talks to it over a WebSocket on 127.0.0.1 with a per-start token; the
  server acts only on the folders main says are open (ADR 0015).
- **Agent sessions** run the user's own `claude` through the Agent SDK, in a worktree per story (ADR 0007).

## Where things go

| Adding…                                   | Put it in                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A domain rule (status, rollup, ownership) | `work-format`, with unit tests                                                                                                       |
| A reusable UI control                     | `packages/client/src/components/controls/`                                                                                           |
| A page or view                            | `packages/client/src/components/`, built from the controls                                                                           |
| A helper shared within a package          | That package's `utils/<topic>.ts`                                                                                                    |
| A new platform capability                 | A method on `FeatraBridge`, implemented in `apps/desktop` preload and main                                                           |
| A server operation                        | A method in `ServerMethods` (`work-format/src/protocol.ts`), handled in `packages/server/src/api.ts`, reached through `FeatraBridge` |
| An architecturally significant decision   | A new ADR, plus a row in `docs/adr/README.md`                                                                                        |
| A lint rule                               | `.oxlintrc.json`, with a bad file in that package's `lint-fixtures/` and a case in `tooling/test/lint-rules.test.ts`                 |

Keep this file up to date when packages or boundaries change. That check is on the review checklist in
[coding-standards.md](coding-standards.md).
