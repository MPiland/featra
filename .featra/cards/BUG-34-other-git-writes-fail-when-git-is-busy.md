---
id: BUG-34
type: bug
title: Other git writes fail when git is busy
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
created: 2026-11-18T22:30:00Z
history:
  - at: 2026-11-18T22:30:00Z
    field: status
    from: null
    to: New
    by: dev-lead
---

## Description

BUG-31 made Approve wait for a held git lock (`runGitPatiently`). Featra's other git writes still use plain `runGit`,
so they fail at once when another process (an editor, an agent, a test) holds `index.lock` or a ref lock:

- `merge-git.ts` publish (`merge --ff-only`): a lock failure returns `false`, which the caller reports as "busy".
- `repo-git.ts` restore (`git restore --staged --worktree`, `git rm --cached`) when discarding a copy.
- `update-ref` in `abandon-git.ts`, `feature-start.ts`, `story-spawn.ts` and `merge-git.ts`.
- `worktree add` and `worktree remove`.

Found in the Opus review of PR #73.

## Acceptance criteria

- [ ] Each git command that writes the index or a ref waits for a held lock, then succeeds once it clears
- [ ] A lock that never clears gives a short, accurate message, not a misleading refusal
- [ ] Regression tests hold a real lock for each path and fail before the fix

## Tasks

## Notes

Filed by the dev lead; not scheduled yet.
