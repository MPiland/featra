---
id: BUG-44
type: bug
title: Windows e2e first answers after launch miss 5 s
status: Done
parent: null
order: 0
origin: bug
role: developer
agent: claude
model: opus
reasoning: null
sessions: []
branch: claude/bug-44-windows-slow-start
pr: "92"
created: 2026-11-25T18:00:00Z
history:
  - at: 2026-11-25T18:00:00Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-25T18:00:00Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
  - at: 2026-11-25T13:40:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:bug-44
  - at: 2026-11-26T01:06:03Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-26T01:06:03Z
    field: status
    from: In Review
    to: Done
    by: user
---

## Description

On E2E (Windows), a different test misses its default 5 s wait on most runs, always on the app's first answers after
launch, setup or Start. Each passed on rerun, and none of the commits involved changed the code path:

- BUG-36: `work-layout.spec.ts:53` (feature branch not made 5 s after Start) and `work-list.spec.ts:60` (first scan
  still running after 5 s).
- BUG-40: `chat-list.spec.ts:34`, the provider group came after 5 s.
- BUG-41: `setup.spec.ts:109`, `work.watch` answered at 5.3 s after setup; `project.setupStatus` took 3.2 s.
- BUG-42: `story-pr.spec.ts:47`, the Settings "Pull requests" switch.
- BUG-43: `review-draft.spec.ts:36`, the draft's card pane.
- Also: `proof-setup.ts:48` in run 45635773882 (PR #91), "Saved" in Settings' Proof region.

macOS and Ubuntu don't fail this way. The pattern points to one cause on Windows: the server's first git work (or
process starts) after launch is slow, and every view waiting on it misses 5 s. This card replaces fixing each test on
its own.

## Acceptance criteria

- [x] The cause is found from the kept traces and `main.log` files and recorded in Notes with timings (which calls, how long, and why on Windows). If it is a product slowness, a regression test fails before the fix. (test: packages/server/test/work-watch-share.test.ts::answers a new watcher with the scan after the one in flight, not after a scan of its own per earlier watcher) (test: packages/server/test/work-watch-share.test.ts::answers a new watcher with the cards as they are when it asks, though a scan that read them earlier runs) (test: packages/server/test/work-watch-share.test.ts::gives the actions that ask while a scan runs one scan between them, started after they asked) (test: packages/server/test/services-git.test.ts::applies a stale copy with one git command, the restore, and pushes the list without it) (test: packages/server/test/work-watch-handles.test.ts::starts git's watchers before the first scan reads git, so the rescan after it doesn't ask git again (BUG-44)) (test: packages/server/test/work-watch-handles.test.ts::asks git again when a worktree's folder comes or goes, not when only its times change) (test: packages/server/test/work-watch-handles.test.ts::asks git again after a scan starts a recursive watcher where recursive watchers share one stream (macOS)) (test: packages/server/test/work-watch-late.test.ts::asks git again for a branch made just before a scan that reuses git starts its git watchers) (test: packages/server/test/ws-unwatch-early.test.ts::stops the watch when it answers, so nothing is pushed for it) (test: packages/server/test/ws-unwatch-early.test.ts::forgets an unwatch for a watch it never had, so a later watch with that id is kept) (test: packages/server/test/ws-unwatch-early.test.ts::forgets an unwatch for a watch that failed, so a later watch with that id is kept) (test: packages/server/test/config-writer-busy.test.ts::tries again after EPERM, and the value lands with no temporary file left) (test: packages/server/test/atomic-write-leftover.test.ts::is read as neither a card nor the config, and the next config write lands)
- [x] The app's first answers after launch, setup and Start come within the tests' default wait on E2E (Windows), fixed at the cause. No assertion is weakened, deleted or reordered; a longer wait is only acceptable if the cause is shown to be the runner itself, and is then recorded in an ADR.
- [x] E2E (Windows) passes 10 runs in a row on this branch with no failed test.
- [x] BUG-36, BUG-40, BUG-41, BUG-42 and BUG-43 are each closed by this fix with a note, or left open with a note on why they have a different cause.

## Tasks

- [x] Download the `e2e-windows-traces` artifacts of the runs named in BUG-36 to BUG-43 and run 45635773882 (attempt 1)
- [x] Time the server's first scan, git and process starts on Windows against Linux and macOS
- [x] Fix the cause, with a regression test
- [x] Prove 10 green E2E (Windows) runs

## Notes

**Cause (from the kept traces and `main.log` files).** At start the server's own services each watch every open
project (Needs, PRs, checks, feature ends, auto-merge), then the page asks for its watch, and actions ask for scans of
their own. Every ask queued a whole scan behind the others, about six per folder at start, two of them with git (the
first, and the BUG-12 rescan its new git watchers forced). Each git start takes about 200 ms on a Windows runner, up
to 1.9 s under load, so the queue ran 5–8 s:

- BUG-41, BUG-43, BUG-36 (work-layout): the first `work.watch` answered at 5.2–8.5 s; a draft's Approve at 5.3 s.
- The BUG-12 git rescan fired twice on Windows: `git worktree list` reading a worktree's folder is reported as a
  `change` to that folder, which counted as a git target.
- Proof "Saved" (run 45635773882): `EPERM … rename` on `.featra/config.yaml` while a scan had it open. Config writes
  now retry like card writes (BUG-16).
- A `work.unwatch` sent before its watch answered (a screen that unmounted at once) found nothing, and the watch kept
  pushing for the socket's life, adding scans.

**Fix (ADR 0016, amended).** Asks (first answers and actions) join the scan queued and not started, which still
starts after them; git's watchers start once a scan knows the repository's paths, so no git rescan follows the first
scan; a child folder of `worktrees` counts only on `rename`; an early `work.unwatch` ends the watch as it answers.

**Not the server.** BUG-40 and BUG-36 (work-list): the server answered in 69 and 411 ms, but the page's WebSocket
handshake started about 4.75 s after the page had rendered "Loading…" (other traces: 0.4–0.9 s). The delay is between
the App's mount and the socket opening (the endpoint IPC, main, or Chromium); not explained by these traces.

**BUG-41's 52 s close** comes only after a failure: the test's `finally` disposes the profile and project folders
(`rm` with 20 retries, linear backoff, about 21 s each) while the app still holds files. Harmless.

**Proof.** E2E (Windows) passed 10 runs in a row on PR #92, all of run 45671030090 (attempt 1 the push, 2-10 reruns of the E2E (Windows) job): jobs 139406022288, 139412101252, 139417477219, 139422798119, 139428637693, 139434451143, 139439552203, 139444673369, 139450440252, 139454976954. Attempt 1 had every job green. BUG-36, BUG-41, BUG-42 and BUG-43 are Done; BUG-40 stays open for the late page socket.

**Review (Opus, PR #92).** A git watcher that first starts in a scan that reuses git is now marked stale and a rescan
that asks git follows; the watcher code moved to `work-watch-targets.ts`; `writeAtomic` moved to `atomic-write.ts` so the
config writer doesn't pull in the card actions (a crash's `.<hex>.featra-tmp` leftover is never read); an unwatch
is remembered only for a request in flight and forgotten when it answers. Each new test was seen failing with its fix
reverted.

**macOS (E2E).** After the review, work-layout.spec.ts failed on macOS three times (runs 45698430494, 45706414860):
the proven story never merged on its own. A temporary trace showed the story's commit landed as a scan started its
new worktree's `.featra` watcher; Node's recursive watchers share one FSEvents stream there, the restart dropped the
`refs/heads` event, and every rescan after it reused git's old commit, so auto-merge never saw a candidate. On macOS a
scan that starts a recursive watcher now marks git as changed (ADR 0016). The trace was reverted.
