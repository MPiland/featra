# 0011 — Package boundaries: pure domain core, UI, platform

Date: 2026-11-04 · Status: accepted

## Context
Card rules (parsing, history, ownership, rollups, evidence) are needed by the server, the UI, the MCP and the tests.
Separate copies would drift apart. Logic tangled with Electron or React can't be tested quickly.

## Decision
The repo is a pnpm workspace. Dependencies point one way, toward `work-format`:

| Package | Holds |
|---|---|
| `packages/work-format` | Pure TypeScript domain logic, with no I/O, React or Electron. It is the single source of truth for card rules. |
| `packages/client` | The React UI. It reaches the platform only through the `FeatraBridge` interface. |
| `packages/server` (planned) | Node services: the index, git, `gh` and sessions. |
| `packages/mcp` (planned) | The stdio bridge to the server. |
| `apps/desktop` | The Electron platform: windows, tray, menus, IPC and storage. It implements the bridge through the preload script. |

## Consequences
- Domain rules are unit-tested without mocks.
- The same client can run in a browser for remote control (M2), behind a different bridge.
- A lint rule enforces the boundaries (ADR 0014).
