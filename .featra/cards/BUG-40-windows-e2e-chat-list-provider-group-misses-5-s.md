---
id: BUG-40
type: bug
title: Windows e2e chat list's provider group misses its 5 s wait
status: In Progress
parent: null
order: 0
origin: bug
role: developer
agent: claude
model: opus
reasoning: null
sessions: []
branch: claude/bug-40-socket-delay
pr: 93
created: 2026-11-24T16:30:00Z
history:
  - at: 2026-11-24T16:30:00Z
    field: status
    from: null
    to: New
    by: session:story-72
  - at: 2026-11-26T03:19:35Z
    field: status
    from: New
    to: In Progress
    by: session:bug-40
---

## Description

In CI run 45420608964 (PR #87, commit 882a953, STORY-72), E2E (Windows) failed one test. The other six jobs passed,
and E2E (Windows) passed the other 83 tests:

- `e2e/chat-list.spec.ts:34`: the "Claude Code" group wasn't in the Chats region 5 s after launch.
- The app's `main.log` shows the server listening at 15:03:33.68 and the window shown at 15:03:33.72. The test then
  gave up at the default 5 s timeout, and its run took 6.0 s in all.
- The page snapshot Playwright took when the test failed already shows `group "Claude Code"` with an empty list. So
  the group came, but only after the wait ended.

The group shows once the server's provider list answers: the `claude` stand-in is found on the PATH and named by the
server. The test had never failed on main or a feature branch before. Of the last 60 failed runs, the only other
chat-list failure was on macOS at a different line, on a story branch.

STORY-72's change doesn't touch provider detection, the chat list or startup:

- The evidence copies folder is cleared on the first open, not at launch.
- The new host providers in the client only wrap the same contexts.

This is the same kind of failure as BUG-36: the app's first work after launch on a slow Windows runner, against the
default 5 s wait.

## Acceptance criteria

- [x] The cause is found and recorded in Notes: why the provider group can take over 5 s to show on a Windows runner.
      If it is a product bug, a regression test fails before the fix. (test: apps/desktop/e2e/startup-proxy.spec.ts::The first answers come from the local server without waiting on the system's proxy settings) (test: apps/desktop/e2e/startup-session.spec.ts::The page's first request reads nothing from the profile's cookie store)
- [ ] The test passes 20 E2E (Windows) runs in a row, with its assertions unchanged.

## Tasks

- [x] Time the provider list's first answer on a Windows runner from the app's log
- [x] Fix the cause without weakening the test

## Notes

- Found by STORY-72. Kept files: the `e2e-windows-traces` artifact of run 45420608964 (attempt 1).
- Possibly the same root cause as BUG-36. Look at the two together.

Left open by BUG-44: a different cause. The server answered in 69 ms; the page's WebSocket handshake started about 4.75 s after the App rendered "Loading…" (0.4-0.9 s in other traces), between the App's mount and the socket opening (the endpoint IPC, main, or Chromium). Not reproduced in BUG-44's 10 green E2E (Windows) runs (run 45671030090, attempts 1-10), but nothing there changed that path.

Cause (PR #93, ADR 0046). The server answered in milliseconds. The page's socket to 127.0.0.1 waited in Chromium
before it opened, for two reasons:

- Proxy: Chromium decides a proxy for every request, loopback included, and on Windows the system's settings can make
  it look one up first. Socket open took 291 ms on average on E2E (Windows) (9 to 823 ms, 95 launches), against 49 ms
  on Ubuntu and 26 ms on macOS.
- Cookie store: with the proxy direct, Chromium's net log showed the socket waiting on `COOKIE_PERSISTENT_STORE_LOAD`
  (the profile's cookie database): 0.2 s in a good launch, over 5 s in a failed one (run 45888994492, job
  140231595459, chat-list:34, never connected; job 140272506433, work-list:68, socket 5.4 s late).

Fix: the window has its own in-memory session (partition `featra`) and connects directly. The default session connects
directly too: with only the window's session direct, Chromium still fetched the proxy script at startup (run
45962632305, Windows and macOS). Red first: `startup-proxy.spec.ts` failed on all three platforms in run 45883838105
(Windows job 140129516001); `startup-session.spec.ts` in run 45959551714 (Windows 140373851940, macOS 140373852172,
Ubuntu 140373852289).

Soak at d71203f, run 45968240720, E2E (Windows): attempts 1-13 green (jobs 140402024270, 140406161978, 140410183573,
140414096239, 140418090281, 140421795782, 140425072900, 140429267524, 140432535285, 140436724888, 140440552986,
140444650453, 140448077038), 14 failed, 15-18 green (140456512551, 140460584675, 140464327395, 140468657446),
19 failed, 20-23 green (140476912584, 140480615218, 140484779636, 140488411381), 24 failed. No failure had this bug's
shape; the page's socket opened at once in each:

- 14 (140452173354): `ci-proven.spec.ts:58`, the feature branch not made in time (the BUG-44 kind).
- 19 (140472702177): `story-pr.spec.ts:47`, the PRs switch's setting not shown in time.
- 24 (140491756384): `setup.spec.ts:109`, BUG-41 again: after setup, `project.setupStatus` took 5.1 s and `work.watch`
  7.1 s; closing the app then took about 52 s.

Earlier soaks had other causes too: `proof-setup.ts:48` (a stale proof.set answer, run 45888994492 attempt 10), and the
Start branch waits in `proof-capture`, `work-layout`, `story-pr`, `proven-story.ts:80`, `draft-chat.ts:30` and
`update-card:44` (runs 45888994492 and 45935606968). 20 in a row stays open while those flake.
