---
id: BUG-4
type: bug
title: Intermittent WSLg e2e failures
status: New
parent: null
order: 0
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-06T19:18:27Z
history:
  - at: 2026-11-06T19:18:27Z
    field: status
    from: null
    to: New
    by: session:dev-lead
---

## Description

Two e2e tests have each failed once on WSLg (Ubuntu), with nothing else running. Neither failure has come back when retried, and neither has a known cause. Neither is traced to the feature in progress, so this is on the project bug list.

- `apps/desktop/e2e/contrast.spec.ts` "AC4: theme follows the OS and meets WCAG AA › dark" failed once on `feature/13-app-shell` at dad8ef5. That was the first run after `pnpm install` and a rebuild. Its error wasn't kept. Since then it has passed 3 times on its own and in 4 full runs.
- `apps/desktop/e2e/menu.spec.ts` "Edit items act on the focused field" failed once on STORY-19's branch: Paste gave "ehello menul". That was 1 of 31 runs on that branch, against 0 of 28 on main.

## Acceptance criteria

- [ ] Each failure is reproduced, with its error and trace kept, and its cause is recorded in Notes. If the cause is a product bug, a regression test fails before the fix.
- [ ] Both tests pass in 20 full WSLg runs in a row, with their assertions unchanged.

## Tasks

- [ ] Run the full WSLg suite repeatedly, including right after a fresh install and build, keeping traces of failures
- [ ] Fix the cause, in the product or in the test's isolation, without weakening any assertion

## Notes
- 2026-11-06 (STORY-2 review): `menu.spec.ts` "Edit items act on the focused field" failed again on WSLg, 1 of 4 runs.
- 2026-11-06 (STORY-2 review, Windows): `tray.spec.ts:220` "launching Featra again shows the running app's window"
  failed `windowInForeground` 2 of 7 runs on 94de547, then 0 of 150 on 8a43e99 (the developer's 60 plus 90 of mine).
  Not reproduced. If it comes back, it's likely BUG-2's foreground lock, not WSLg.
