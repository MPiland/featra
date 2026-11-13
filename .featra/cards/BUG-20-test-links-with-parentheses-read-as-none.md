---
id: BUG-20
type: bug
title: Test links with parentheses in test names read as none
status: Done
parent: FEAT-6
order: 9
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-14-feature-to-main
pr: null
created: 2026-11-13T02:00:00Z
history:
  - at: 2026-11-13T02:00:00Z
    field: status
    from: null
    to: New
    by: session:story-14
  - at: 2026-11-13T02:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:story-14
  - at: 2026-11-13T02:30:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-14
  - at: 2026-11-13T06:48:25Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
  - at: 2026-11-13T13:19:03Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-13T13:19:03Z
    field: status
    from: Acceptance
    to: Done
    by: user
---

## Description

An acceptance criterion's `(test: ...)` link is read as no link when a test name in it has parentheses, such as
`file::Accept on a feature (AC1) > offers it`. The card then shows the criterion with no test. Found in the STORY-14
review: none of the AC links on STORY-12, STORY-13, STORY-14 or STORY-58 resolved (0 of 17).

## Acceptance criteria

- [x] A test link whose test names hold balanced parentheses is read whole, with or without an evidence link after it (test: packages/work-format/test/card.test.ts::parseCard > reads a test link whose test names have parentheses in them (regression: BUG-20, the link read as none))
- [x] A criterion with parentheses of its own and no link keeps its text and has no test (test: packages/work-format/test/card.test.ts::parseCard > reads a test link whose test names have parentheses in them (regression: BUG-20, the link read as none))

## Tasks

- [x] Regression test, failing before the fix
- [x] Allow one level of balanced parentheses in `splitTestRef`'s test ref
- [x] Check the STORY-12, 13, 14 and 58 cards' links resolve

## Notes

Cause: `splitTestRef` in `card.ts` matched the ref with `[^)]+`, so the first `)` in a test name ended it, and the
rest of the line no longer matched the trailing link. The whole match then fell back to no test.

Fix: the ref matches `(?:[^()]|\([^()]*\))+`, so it may hold parentheses one level deep. After the fix, all 17 AC links
on STORY-12 (5), STORY-13 (4), STORY-14 (5) and STORY-58 (3) resolve; before, none did.

Filed and fixed in STORY-14's PR (review Should-fix 3).
