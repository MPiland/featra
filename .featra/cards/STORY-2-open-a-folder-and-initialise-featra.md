---
id: STORY-2
type: story
title: Open a folder and initialise Featra
status: In Review
parent: FEAT-2
order: 1
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-06T21:55:07.601Z
    field: status
    from: New
    to: In Progress
    by: lead
  - at: 2026-11-06T22:20:05.694Z
    field: status
    from: In Progress
    to: In Review
    by: developer
---

## Description

As a builder, I open a folder and Featra sets it up for card-based work without touching my own files.

## Acceptance criteria

- [x] Opening a non-git folder offers git init; opening a repo without `.featra/` offers init (test: packages/server/test/project-setup.test.ts AC1, packages/client/test/components/setup.test.tsx AC1, apps/desktop/test/server-process.test.ts, apps/desktop/e2e/setup.spec.ts)
- [x] Init scaffolds `.featra/config.yaml`, `CONTEXT.md`, `docs/adr/`, `decisions.md`, `open-questions.md` without overwriting existing files (test: packages/server/test/project-setup.test.ts AC2, packages/work-format/test/protocol.test.ts AC2, apps/desktop/test/server-process.test.ts, apps/desktop/e2e/setup.spec.ts)
- [x] Init never creates or edits agent instruction files (CLAUDE.md, AGENTS.md) on its own (test: packages/server/test/project-setup.test.ts AC3, packages/work-format/test/protocol.test.ts AC3, apps/desktop/e2e/setup.spec.ts)

## Tasks

- [x] Pure rules in work-format: the scaffold list, agent instruction files, the server protocol (`protocol.ts`, `scaffold.ts`)
- [x] `packages/server`: git detection and `git init` (repo env overrides stripped), Featra init with create-only writes
- [x] `packages/server`: WebSocket API on 127.0.0.1 with a per-start token and main's open-project allowlist
- [x] Desktop: fork the server on Electron's Node, restart on next use, push the project list, hand the endpoint to the preload
- [x] Client: WebSocket client and `FeatraBridge.setup`; renderer CSP allows loopback `ws:`
- [x] Client: the "Project setup" offer at the top of Work (Initialize Git, Initialize Featra, Not now), on open, create and switch
- [x] Lint boundary for `packages/server` (and client must not import it), with fixtures
- [x] Tests: server integration against real git, server process end to end, client unit and component tests, e2e journey
- [x] ADR 0015 (process model and protocol), decisions.md, architecture.md and CONTEXT.md

## Notes

- Process model, token, allowlist, protocol and the `ws` dependency are in ADR 0015. Smaller choices are in
  decisions.md (STORY-2): banner not dialog, git before Featra init, `wx` writes, README seeded only into a new
  `docs/adr/`, a version-only config, git env stripped.
- Server API (`/v1`): `project.setupStatus`, `project.gitInit`, `project.init`, each `{ dir }`. STORY-3 adds methods to
  `ServerMethods` in `work-format/src/protocol.ts` and handles them in `packages/server/src/api.ts`. Server-pushed
  change events will need a frame shape without `id` (ADR 0015).
- The e2e found the renderer CSP blocking the preload's WebSocket; `connect-src 'self' ws://127.0.0.1:*` fixed it.
- "Not now" lasts until restart, per project. Remembering it, and the guided setup, are STORY-33.
- Not checked: the e2e on WSLg (left to the Dev Lead, per the brief). No installer exists yet; ADR 0015 notes that
  packaging must check the forked `server.cjs` loads from the asar.
- E2E: Windows 32 passed (2 new in setup.spec.ts). Unit and integration: 408 passed.

## Tests

- AC1: `packages/server/test/project-setup.test.ts` (AC1 blocks: plain folder, repo, subfolder of a repo, set up,
  a folder that is gone, git not installed, git hook variables, `git init` and its no-op in a repo);
  `packages/client/test/components/setup.test.tsx` (AC1 block: the offer per state, the browser build);
  `apps/desktop/test/server-process.test.ts` (no-git to ready through the real process and client);
  `apps/desktop/e2e/setup.spec.ts`
- AC2: `packages/server/test/project-setup.test.ts` (AC2 block: the scaffold, version-only config, existing files and
  folders kept byte for byte, run again, refused without git, a file in the way of a folder);
  `packages/work-format/test/protocol.test.ts` (AC2 block); `apps/desktop/e2e/setup.spec.ts`
- AC3: `packages/server/test/project-setup.test.ts` (AC3 block: existing CLAUDE.md and AGENTS.md untouched, none
  created); `packages/work-format/test/protocol.test.ts` (AC3 block); `apps/desktop/e2e/setup.spec.ts`
- Server and protocol: `packages/server/test/ws-server.test.ts` (loopback, token and path, unknown method, bad params,
  not-open folders); `packages/client/test/server-client.test.ts` (ids, reconnect, lost connection);
  `packages/client/test/bridge.test.ts` (a browser tab); `tooling/test/lint-rules.test.ts` (server boundary)
