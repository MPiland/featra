---
id: BUG-25
type: bug
title: Work list blanks and collapses features when a scan fails during a merge
status: New
parent: null
order: 0
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-15T20:00:00Z
history:
  - at: 2026-11-15T20:00:00Z
    field: status
    from: null
    to: New
    by: dev-lead
---

## Description

The Windows e2e "Merge a Verified story: its PR merges with a merge commit, and its worktree and branches go" failed in
CI run 43749728537 (PR #57, attempt 1) at `merge-story.spec.ts:87`: the story row was not found within 30 s. It passed
on a rerun. The run's trace shows the row reading "Merging…", then the whole Work list going blank ("Some cards can't
be shown", "No cards yet") while the merge removed the worktree, then the list coming back with the "Shaping" feature
collapsed, so the story row was not in the page.

Suspected cause: `scanOnce`'s catch in `work-watch.ts` replaces the list with an empty one plus a problem when a scan
throws, the Work list unmounts its features, and `Feature` in `packages/client/src/components/work/FeatureRows.tsx`
keeps its open state in a local `useState(false)`, so the remount collapses it.

Not verified: why the scan failed (the trace doesn't show the problem's text); and whether the merge had finished, since
the card at the end still read In Review with the PR shown as Open (possibly a PR status read before the merge).

## Acceptance criteria

- [ ] A failed scan keeps the last good list and shows the problem
- [ ] A feature stays expanded or collapsed across list updates
- [ ] merge-story.spec.ts no longer fails this way on Windows

## Tasks

## Notes

Found while watching BUG-23's CI (PR #57).
