---
id: BUG-18
type: bug
title: Agent card-update ordering test times out under load
status: In Review
parent: FEAT-5
order: 10
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/bug-18
pr: null
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
---

## Description

In one full local unit run, `packages/server/test/agent-card-update-review.test.ts` "both land, whatever order they
arrive in" timed out; it passed on its own. A second load flake of the same class was added by the Dev Lead:
`packages/server/test/story-stop-order.test.ts` "the interrupt > does not hold the card lane" failed at
`expect(settled).toBe(false)` while another gate ran in parallel.

## Acceptance criteria

- [x] It is found whether the ordering test fails because of a real ordering or lane problem in card writes, or because of timing, with the evidence in Notes.
- [x] The ordering test passes under the load that made it time out, with its assertions unchanged.
- [x] The Stop test no longer depends on real time: its bound expires when the test says, with its assertions unchanged.

## Tasks

- [x] Read the card write path (`card-report.ts`, `card-actions.ts`, `card-lane.ts`, `services.ts`)
- [x] Reproduce under load: 24 parallel runs of the test
- [x] Give the ordering test a limit that fits its work
- [x] Take the Stop test's bound timer over, so it fires when the test says

## Notes

Ordering test, cause: timing, not product. `update_card` (`card-report.ts`), the user's `card.update`
(`card-actions.ts`), and every other card write share one lane (`services.ts` builds one `createCardLane` and passes it to
each), so they run one after the other, each reading fresh, deciding and writing. The test passed in every run; no
run failed an assertion. What fails is the clock: the test does ten writes through the lane (five rounds of one
agent report and one user edit), each a scan, a write and a rescan, about 1.3 s each with one test running (2.6 s a
round, 13 to 19 s in all). The run-wide limit is 30 s (`test:unit` passes `--testTimeout=30000`), so a loaded machine
that slows git and disk by 2x passes the limit.

Evidence: with 8 copies of the file at once, the test took 22 to 23 s; with 24 copies of the test (and the test it
depends on) at once, 24 of 24 failed with "Test timed out in 30000ms" before the change, and 24 of 24 passed after it
(the slowest took 30.1 s, over the old limit). Run on its own with `-t`, the test fails for a different reason: it needs
the STORY-6 session that the "who is calling" case spawns; that is the file's order of cases, not a bug.

Fix: the test has its own limit, `LANE_TEST_MS` (120 s), with the reason in a comment. No assertion, loop count or order
changed. BUG-16's busy-rename retry in `writeAtomic` (PR #31) only lengthens a write that would have failed, so it adds
no time on this path.

Stop test, cause: timing, test side. The world gave Stop a 1.5 s bound (`interruptMs`) and the test asserted the first
Stop had not settled after the second Stop answered. The bound is a real `setTimeout` (`within` in `story-stop.ts`), so
when the second Stop took over 1.5 s the first one's bound ran out, Stop settled, and `expect(settled).toBe(false)`
failed. Reproduced: the old test with a 20 ms bound fails at line 98 with "expected true to be false".

Fix: the test sets the bound to a length no other timer has (`BOUND_MS`) and takes that timer over (`vi.spyOn` on
`setTimeout`, every other timer is real). The bound cannot run out by itself; after the second Stop answers, the
test checks `settled` is false, then fires the first Stop's own timer and checks that Stop answers and the story is
Stopped. That also proves the bound, which the test only implied before. Assertions are unchanged, and one is added
(two bound timers were made).
