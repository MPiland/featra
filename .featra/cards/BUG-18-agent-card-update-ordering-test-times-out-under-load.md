---
id: BUG-18
type: bug
title: Agent card-update ordering test times out under load
status: Done
parent: FEAT-5
order: 10
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/bug-18
pr: "34"
created: 2026-11-11T22:00:00Z
history:
  - at: 2026-11-11T22:00:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-11T22:05:00Z
    field: status
    from: New
    to: In Progress
    by: session:bug-18
  - at: 2026-11-11T22:50:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:bug-18
  - at: 2026-11-12T00:02:42Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
  - at: 2026-11-12T01:21:08Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-12T01:21:08Z
    field: status
    from: Acceptance
    to: Done
    by: user
---

## Description

In one full local unit run, `packages/server/test/agent-card-update-review.test.ts` "both land, whatever order they
arrive in" timed out; it passed on its own. A second load flake of the same class was added by the Dev Lead:
`packages/server/test/story-stop-order.test.ts` "the interrupt > does not hold the card lane" failed at
`expect(settled).toBe(false)` while another gate ran in parallel.

## Acceptance criteria

- [x] It is found whether the ordering test fails because of a real ordering or lane problem in card writes, or because of timing, with the evidence in Notes.
- [x] The ordering test passes under the load that made it time out, with its assertions unchanged, and needs no longer limit.
- [x] The Stop test no longer depends on real time: its bound expires when the test says, with its assertions unchanged.

## Tasks

- [x] Read the card write path (`card-report.ts`, `card-actions.ts`, `card-lane.ts`, `services.ts`)
- [x] Reproduce under load: 24 parallel runs of the test
- [x] Make the ordering test take the product's watched path (the world watches the project)
- [x] Take the Stop test's bound timer over, so it fires when the test says

## Notes

Ordering test, cause: timing, not product. `update_card` (`card-report.ts`), the user's `card.update`
(`card-actions.ts`) and every other card write share one lane (`services.ts` builds one `createCardLane` and passes it
to each); the lane itself is a plain promise chain. Every run passed its assertions; none failed one.

Root cause of the slowness: the test world never calls `work.watch`, so each lane write does two full unwatched scans
(`card-report.ts:95,124`, `card-actions.ts:68,81`) that re-ask git (`work-watch.ts:231-234`). The app's watched path
runs no git for a card-only edit (ADR 0016). Measured with nothing else running: the ordering test took 6.6 s for ten
writes (about 0.65 s each; an earlier figure of 1.3 s was taken while another gate ran). The run limit is 30 s, so
a machine slowed 5x passes it.

Fix: `storyWorld({ watched: true })` has the window ask `work.watch` for the project, as the app does, and this file
uses it, so the test takes the product's real path. The ordering test now takes 0.9 s (0.09 s a write) and the file
6.9 s, against 6.6 s and 20 s. No extra time limit is needed, so `LANE_TEST_MS` is gone. No assertion, loop count or
order changed.

Evidence for load: a time-out under load can't be a deterministic test, so these stand in for one. 24 copies of the
test (with the case it depends on) at once: before, 24 of 24 failed with "Test timed out in 30000ms"; with a 120 s
limit, 24 of 24 passed (the slowest took 30.1 s); with the watched world and no extra limit, 24 of 24 passed, the
slowest 4.6 s. Run alone with `-t`, the test fails for another reason: it needs the STORY-6 session that the "who is
calling" case spawns (on the roadmap). BUG-16's busy-rename retry in `writeAtomic` (PR #31) only lengthens a write that
would have failed, so it adds nothing here.

Left on the roadmap, not done here: an unwatched project pays two git scans per card write (reuse git state for lane
writes on unwatched folders), and the ordering case's dependency on the "who is calling" case.

Stop test, cause: timing, test side. The world gave Stop a 1.5 s bound (`interruptMs`) and the test asserted the first
Stop had not settled after the second Stop answered. The bound is a real `setTimeout` (`within` in `story-stop.ts`), so
when the second Stop took over 1.5 s the first one's bound ran out and `expect(settled).toBe(false)` failed.
Reproduced: the old test with a 20 ms bound fails at line 98 with "expected true to be false" (it stands in for the
load case, which can't be made deterministic).

Fix: the test sets the bound to a length no other timer has (`BOUND_MS`) and takes that timer over (`vi.spyOn` on
`setTimeout`; every other timer is real). The bound can't run out by itself; after the second Stop answers, the test
checks `settled` is false, then fires the first Stop's own timer and checks that Stop answers and the story is Stopped,
which also proves the bound. The takeover is for the whole file, so a stuck interrupt in another case waits for the test
timeout (said in the file's doc comment). The list of timers is cleared in `beforeEach`. Assertions are unchanged, and
one is added (two bound timers were made).
