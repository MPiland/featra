---
id: STORY-63
type: story
title: Featra runs and is tested on macOS
status: In Review
parent: FEAT-19
order: 1
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-63-macos-ci
pr: https://github.com/MPiland/featra/pull/72
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
  - at: 2026-11-18T20:15:44Z
    field: status
    from: In Progress
    to: In Review
    by: dev
---

## Description

As a builder on a Mac, I run Featra from source and it works like it does on Windows and Linux, because every PR is tested on macOS too.

## Acceptance criteria

- [x] An "E2E (macOS)" CI job runs the full e2e suite on an Apple silicon macOS runner on every PR and push to main, and passes (test: apps/desktop/test/e2e-report.test.ts::CI runs the e2e suite on macOS (STORY-63) > runs an E2E (macOS) job on an Apple silicon runner on every PR and push to main)
- [x] On macOS, Featra's platform behaviour is right and asserted: the app menu, the menu bar icon, closing the last window keeps the app running in the Dock, and reopening it from the Dock shows the window (test: apps/desktop/e2e/mac.spec.ts::macOS: the app menu, the menu bar and the Dock (STORY-63) > has the macOS app menu and Edit menu, and no menu bar icon, apps/desktop/e2e/mac.spec.ts::macOS: the app menu, the menu bar and the Dock (STORY-63) > closing the last window keeps Featra running in the Dock, and the Dock icon shows the same window again, apps/desktop/e2e/mac.spec.ts::macOS: the app menu, the menu bar and the Dock (STORY-63) > the app menu's Quit Featra quits, even with the window closed to the Dock, apps/desktop/test/app-name.test.ts::the app's name (STORY-63) > is Featra, not the package's name, so the macOS app menu says About Featra and Quit Featra)
- [x] The macOS job uploads a JUnit report that Featra reads with the other platforms' reports to prove criteria, so a test that fails only on macOS isn't Proven (test: apps/desktop/test/e2e-report.test.ts::each platform's e2e report proves criteria with the others (STORY-63) > doesn't prove a criterion whose test failed only on macOS, reading every platform's report CI uploads)
- [x] A failed macOS run uploads its screenshots and traces, and the design-review screens are uploaded too, as on Windows and Ubuntu (test: apps/desktop/test/e2e-report.test.ts::CI runs the e2e suite on macOS (STORY-63) > uploads a failed macOS run's screenshots and traces, and the screens for design review, as the others do)
- [x] The soak workflow takes macOS as a platform (test: tooling/test/soak-plan.test.ts::soak plan > soaks on macOS, on the Apple silicon runner the macOS e2e job uses (STORY-63))
- [x] README and docs/testing.md say macOS is tested on CI, and name the check to add to main's branch protection (test: apps/desktop/test/e2e-report.test.ts::CI runs the e2e suite on macOS (STORY-63) > says in the README and docs/testing.md that macOS is tested on CI, and names the check to require)

## Tasks

- [x] CI: an `e2e-macos` job (`E2E (macOS)`) in ci.yml with the same uploads as the other e2e jobs; the setup action works on macOS
- [x] Run the suite on macOS and fix what fails there, in the product or the tests; tests that depend on the platform assert macOS's own behaviour
- [x] Soak: `macos` in the platform choice and in `tooling/ci/soak-plan.ts`, with its test
- [x] Proof: the macOS report artifact in the default test report pattern, if it isn't matched already
- [x] Docs: README, docs/testing.md, ADR 0009's consequences (each story's e2e also runs on macOS)
- [x] Unit and integration tests for each criterion; tests linked on the criteria
- [x] Decisions recorded for the Dev Lead; move to In Review

## Notes

Featra has never run on macOS (decisions.md, 2026-11-17), so expect real failures here: paths, the menu bar, window state, tray probes and process tree kills. Each one found is a task in this story, or a bug if it's in merged work outside it. Branch protection: once the job passes on main, the user adds "E2E (macOS)" to main's required checks (decisions.md, 2026-11-18). It's a repository setting, so the story agent asks for it and doesn't change it.

The Dock in tests: Playwright can't click the Dock, so `clickDock` (e2e/app.ts) emits Electron's `activate` event in the main process with `app.emit("activate", event, hasVisibleWindows)`, which Featra's own `app.on("activate")` handler takes, as a real Dock click would. The red traffic light is `BrowserWindow.close()`, and the app menu's Quit sends its native selector, `terminate:`.

## Depends on

- FEAT-18 Tests run on CI
