---
id: STORY-63
type: story
title: Featra runs and is tested on macOS
status: In Progress
parent: FEAT-19
order: 1
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-63-macos-ci
pr: null
created: 2026-11-18T12:00:00Z
history:
  - at: 2026-11-18T12:00:00Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-18T18:33:03Z
    field: status
    from: New
    to: In Progress
    by: dev
---

## Description

As a builder on a Mac, I run Featra from source and it works like it does on Windows and Linux, because every PR is tested on macOS too.

## Acceptance criteria

- [ ] An "E2E (macOS)" CI job runs the full e2e suite on an Apple silicon macOS runner on every PR and push to main, and passes
- [ ] On macOS, Featra's platform behaviour is right and asserted: the app menu, the menu bar icon, closing the last window keeps the app running in the Dock, and reopening it from the Dock shows the window
- [ ] The macOS job uploads a JUnit report that Featra reads with the other platforms' reports to prove criteria, so a test that fails only on macOS isn't Proven
- [ ] A failed macOS run uploads its screenshots and traces, and the design-review screens are uploaded too, as on Windows and Ubuntu
- [ ] The soak workflow takes macOS as a platform
- [ ] README and docs/testing.md say macOS is tested on CI, and name the check to add to main's branch protection

## Tasks

- [ ] CI: an `e2e-macos` job (`E2E (macOS)`) in ci.yml with the same uploads as the other e2e jobs; the setup action works on macOS
- [ ] Run the suite on macOS and fix what fails there, in the product or the tests; tests that depend on the platform assert macOS's own behaviour
- [ ] Soak: `macos` in the platform choice and in `tooling/ci/soak-plan.ts`, with its test
- [ ] Proof: the macOS report artifact in the default test report pattern, if it isn't matched already
- [ ] Docs: README, docs/testing.md, ADR 0009's consequences (each story's e2e also runs on macOS)
- [ ] Unit and integration tests for each criterion; tests linked on the criteria
- [ ] Decisions recorded for the Dev Lead; move to In Review

## Notes

Featra has never run on macOS (decisions.md, 2026-11-17), so expect real failures here: paths, the menu bar, window state, tray probes and process tree kills. Each one found is a task in this story, or a bug if it's in merged work outside it. Branch protection: once the job passes on main, the user adds "E2E (macOS)" to main's required checks (decisions.md, 2026-11-18). It's a repository setting, so the story agent asks for it and doesn't change it.

## Depends on

- FEAT-18 Tests run on CI
