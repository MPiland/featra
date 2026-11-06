# Architecture

This is a map of the code. The reasoning behind each choice is in the ADRs (`docs/adr/`), and the terms are defined in
[CONTEXT.md](../CONTEXT.md).

## Packages

Dependencies point one way, toward `work-format` (ADR 0011).

```
apps/desktop ──► packages/client ──► packages/work-format
      │                                   ▲
      └──► packages/server (planned) ─────┘
                  ▲
           packages/mcp (planned)
```

| Package                     | Job                                                                                                                     | Must not                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `packages/work-format`      | Card parse and serialize, `history[]`, ownership, rollups, evidence, config. Pure functions.                            | Do I/O, or import React, Electron or Node APIs.       |
| `packages/client`           | The React UI: views, menus, shortcuts, settings pages. Reaches the platform through `FeatraBridge` (`bridge.ts`).       | Import Electron or Node, or call IPC directly.        |
| `apps/desktop`              | Electron main process and preload. Owns windows, tray, the app lifecycle, troubleshooting, settings storage and IPC.    | Hold domain rules. It calls `work-format` instead.    |
| `packages/server` (planned) | The local server: SQLite index, git and worktrees, `gh`, the session manager and provider adapters (ADRs 0007, 0012).   | Be reachable from outside 127.0.0.1.                  |
| `packages/mcp` (planned)    | The stdio MCP bridge from agents to the server (ADRs 0006, 0010).                                                       | Write cards itself. All writes go through the server. |
| `tooling`                   | The quality gate's own code: the git hook installer and the tests that prove lint, format and the hook work (ADR 0014). | Ship in the app.                                      |

## Runtime

- **Electron main** starts the window, tray and menus. The renderer runs with context isolation and the sandbox on, and
  reaches the platform only through the preload's typed bridge.
- **The server** (planned) runs as a child process on Electron's Node runtime. The client talks to it over a local
  WebSocket.
- **Agent sessions** run the user's own `claude` through the Agent SDK, in a worktree per story (ADR 0007).

## Where things go

| Adding…                                   | Put it in                                                                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A domain rule (status, rollup, ownership) | `work-format`, with unit tests                                                                                       |
| A reusable UI control                     | `packages/client/src/components/controls/`                                                                           |
| A page or view                            | `packages/client/src/components/`, built from the controls                                                           |
| A helper shared within a package          | That package's `utils/<topic>.ts`                                                                                    |
| A new platform capability                 | A method on `FeatraBridge`, implemented in `apps/desktop` preload and main                                           |
| An architecturally significant decision   | A new ADR, plus a row in `docs/adr/README.md`                                                                        |
| A lint rule                               | `.oxlintrc.json`, with a bad file in that package's `lint-fixtures/` and a case in `tooling/test/lint-rules.test.ts` |

Keep this file up to date when packages or boundaries change. That check is on the review checklist in
[coding-standards.md](coding-standards.md).
