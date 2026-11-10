---
id: STORY-52
type: story
title: Start a feature
status: In Review
parent: FEAT-5
order: 1
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-10T18:00:00Z
history:
  - at: 2026-11-10T18:00:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-10T19:00:00Z
    field: status
    from: New
    to: In Progress
    by: developer
  - at: 2026-11-10T20:00:00Z
    field: status
    from: In Progress
    to: In Review
    by: developer
---

## Description

As the user or the Dev Lead, I start an approved feature so its work gets its own branch.

## Acceptance criteria

- [x] Start on an approved feature (in Work and in the feature's chat) creates `feature/N-slug` from the base branch without changing main's checkout, and the feature becomes active with a `by: user` history event (test: packages/server/test/feature-start.test.ts::AC1: Start creates the feature's branch and the feature is active on it > does not change main's checkout: same branch, same HEAD, and staged, unstaged and untracked files as they were)
- [x] The Dev Lead can start it through the MCP tool `start_feature`; the history event says `by: session:<id>` (test: packages/mcp/test/start.test.ts::AC2: start_feature through the Featra MCP > starts the approved feature as the chat's session, and a second call is refused)
- [x] After Start, the feature and its stories are read from the feature branch (the owner) and main's copies are no longer shown (test: packages/server/test/feature-start.test.ts::AC3: after Start the feature and its stories are read from the feature branch > the branch owns the feature and each of its stories, and main's approved copy isn't shown)
- [x] Start is refused with a clear message when the feature isn't approved, its branch already exists, or the base branch can't be found (test: packages/server/test/feature-start.test.ts::AC4: Start is refused with a clear message > refuses when the base branch can't be found, saying how to set it)

## Tasks

- [x] Pure rules in work-format: branch name, startable reason, started card, `start_feature` input, `CardView.startable`
- [x] Server `feature.start` in the card lane: temporary worktree, commit with hooks, all or nothing
- [x] Window and agent socket methods; MCP tool `start_feature`
- [x] Start button in the card pane (Work and the chat's docked pane), and Open on an approved feature's row
- [x] Tests: work-format rules, real-git server tests, both sockets, MCP over stdio, client component tests
- [x] Playwright Electron journey (apps/desktop/e2e/start-feature.spec.ts; CI only)
- [x] ADR 0024

## Notes

- Also proved by: packages/server/test/feature-start-socket.test.ts (window `feature.start` as user, agent socket as session:<chat>), packages/client/test/components/start-feature.test.tsx (the buttons, refusals, keyboard), packages/work-format/test/card-start.test.ts, and the e2e journey.
- Added beyond the brief: an Open button on an approved feature's row in Work. A feature row only opened its stories, so after a restart there was no way to reach an approved feature's pane to Start it.
- Two existing assertions touched, both tool-name enumerations (packages/mcp/test/stdio.test.ts and apps/desktop/test/mcp-bundle.test.ts); `start_feature` was appended (as STORY-8 did), nothing weakened.
- Open for the Dev Lead: Featra's own pre-commit hook runs the full check, which a fresh temporary worktree can't pass (no node_modules). Start refuses there with the hook's message. See ADR 0024.
