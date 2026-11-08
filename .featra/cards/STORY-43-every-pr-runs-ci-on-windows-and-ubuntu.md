---
id: STORY-43
type: story
title: Every PR runs CI on Windows and Ubuntu
status: In Progress
parent: FEAT-18
order: 1
origin: added
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-07T19:20:00Z
history:
  - at: 2026-11-07T19:20:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-08T01:28:39.915Z
    field: status
    from: New
    to: In Progress
    by: user
---

## Description

As a builder working on my only PC, I want every test to run on GitHub Actions instead of my desktop, so that tests never fight me for focus and main only takes code that passes on Windows and Linux. The repo goes public as `MPiland/featra` (decisions.md, 2026-11-07). WSLg was only a stand-in for Linux, so Linux runs move to Xvfb with a window manager.

## Acceptance criteria

- [ ] Before the first push, the full git history is checked for secrets, personal paths and email addresses. The findings and any fixes are recorded in Notes.
- [ ] Each PR to main shows separate checks for the gate (format, lint, typecheck, unit tests), Windows e2e and Ubuntu e2e. Branch protection blocks the merge unless all three pass.
- [ ] Every e2e test passes on GitHub's Windows runner, including the foreground tests (tray, window state, menu). Ubuntu runs the full suite under Xvfb with a window manager, so the BUG-1 maximize test runs instead of being skipped. If the Windows foreground tests can't pass on the runner, the user decides on a local VM before anything is weakened.
- [ ] A soak run can be started on demand for a chosen spec, platform and run count, and stops at the first failure while keeping its trace.
- [ ] The same Ubuntu Xvfb run works locally in WSL with one command, and nothing appears on the user's desktop.

## Tasks

- [ ] Audit the history and record the findings; create the public repo `MPiland/featra` and push main
- [ ] Workflow: gate job, Windows e2e job, Ubuntu e2e job (Xvfb plus a window manager); upload Playwright traces on failure
- [ ] Branch protection on main requiring the three checks
- [ ] On-demand soak workflow (`workflow_dispatch`: spec, platform, runs)
- [ ] Local WSL script for the Xvfb run; document both in the testing docs
- [ ] Prove each AC with a PR whose checks are visible, plus one deliberately failing branch that is blocked

## Notes

- Blocks BUG-4, whose soak runs (150 Windows tray runs, 20 full Linux runs) move to CI and whose WSLg criterion becomes Linux under Xvfb.
- Pushing: the Dev Lead may push branches to this repo only, never force and never directly to main.
