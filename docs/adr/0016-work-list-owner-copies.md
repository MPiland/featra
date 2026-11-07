# 0016 — The Work list from owner copies: index, watching, push frames and stale copies

Date: 2026-11-06 · Status: accepted

## Context

STORY-3 shows the project's epics, features and stories on the Work view. ADR 0002 says each card has one owner: main,
a feature branch, or a story or bug worktree. The list must show each card from its owner only, across every worktree
and branch, and update within 1 s when a card file changes outside the app. An edit made to a copy that is not the
owner's must be flagged, never merged silently.

ADR 0012 decided on a SQLite index that holds only what files and git can rebuild. ADR 0015 defined the protocol as
request and answer only, and said change notifications would need frames that can't be mistaken for an answer.

## Decision

**Where each card is read from.** For every scan, the server collects card copies from these locations:

- main: the worktree that has the base branch checked out, read from disk; if none has it, from git objects;
- each feature branch: its worktree from disk if it has one, otherwise from git objects;
- each other branch that has a worktree: that worktree, from disk.

The pure rules live in work-format (`branch-rules.ts`, `owner-copies.ts`), and the server imports them; it never
re-implements them. Card files from git objects are read with `ls-tree -z` and one `cat-file --batch` per scan.

**Ownership rules.**

1. A branch `feature/<n>` or `feature/<n>-…` belongs to `FEAT-n`. It is merged when no worktree has it checked out and
   its tip is in the base branch. A branch made at base with no commits of its own therefore reads as merged, and its
   cards are main's. That is harmless, and it is tested.
2. A story or bug worktree is matched by the card's `branch:` field first. Otherwise a branch name segment
   `story-<n>` or `bug-<n>` matches when it is followed by `-` or the end of the segment, ignoring case, so `story-2`
   never matches `story-24`. Detached worktrees are ignored. A live worktree is never treated as merged.
3. A **stale copy** is an uncommitted working-tree edit in a location that is not the owner, which differs both from
   that location's HEAD and from the owner's copy. Text compares with CRLF normalised to LF.
4. **Apply to owner** is a field-level three-way apply. The base is the stale location's HEAD, the edit is the stale
   copy, and the target is the owner's copy. Status and parent changes go through `history.ts` at the owner, recorded
   `by: "user"`. A field changed on both sides is a conflict. The apply is refused and touches neither file. After a
   successful apply, the stale copy is restored from git. The owner must be checked out in a worktree; a feature
   branch without one is refused with "Check it out first."
5. **Discard** restores the stale copy from HEAD (`git restore --staged --worktree`), or deletes it when HEAD does not
   have the file.

**Index.** `<git-common-dir>/featra/index.sqlite`, shared by every worktree of the repository, through `node:sqlite`.

| Table    | Columns                                                | Holds                                 |
| -------- | ------------------------------------------------------ | ------------------------------------- |
| `meta`   | `key`, `value`                                         | The schema version (`1`)              |
| `blobs`  | `sha`, `text`                                          | Card file text by git blob id         |
| `owners` | `card_id`, `type`, `parent`, `status`, `owner`, `path` | Each card's owner, from the last scan |

`blobs` saves re-reading unchanged files from git objects. `owners` is written after every scan; it is not yet read by
anything, and exists for the agent tools and later views. The index opens with a 2 s busy timeout and
`PRAGMA quick_check`. A file that fails the check, or has another schema version, is deleted with its `-journal`,
`-wal` and `-shm` files and built again. Deleting it loses nothing.

**Watching.** A watch on a folder is shared by every listener of that folder. It watches with `fs.watch`:

- the opened folder, for a `.featra` made there (by init);
- each location's folder, for `.featra`, and each `.featra`, recursively;
- the git common dir, for `HEAD` and `packed-refs`;
- `refs/heads`, recursively;
- `worktrees`, recursively, for `HEAD` and `gitdir`.

Events settle for 50 ms, then the server rescans. Rescans run one at a time. The targets are set again after each scan,
so a new worktree or branch is picked up. Listeners hear only a list whose JSON changed. The last listener to stop ends
the watch. After the server applies or discards a copy, it rescans at once rather than waiting for the events.

**Protocol additions (ADR 0015).**

| Method             | Params         | Result                                         |
| ------------------ | -------------- | ---------------------------------------------- |
| `work.watch`       | `{ dir }`      | The `WorkList`; the request id names the watch |
| `work.unwatch`     | `{ watch }`    | `null`                                         |
| `work.applyCopy`   | `{ dir, key }` | `{ ok: true }` or `{ ok: false, error }`       |
| `work.discardCopy` | `{ dir, key }` | `{ ok: true }` or `{ ok: false, error }`       |

A **push** is `{ event, watch, data }`, with no `id`, so it can't be mistaken for an answer. The only event is
`work.list`, whose `data` is the new `WorkList`. Pushes stop on `work.unwatch` or when the socket closes, and are held
back while the folder is not in the open-project list. A stale copy's `key` is `<location>|<path>`, built by `copyKey`.

**Client.** `ServerClient.watch` registers the watch id before sending, so a push that beats the answer is routed. When
the socket drops, the listener keeps the last list with the reason, and the watch starts again on a new connection
after 1 s.

**List shape.** The server sends the counts already computed by work-format's rollups (ADR 0003): epics, their features
and the features' stories, each with a tone, filter keys, counts and a segmented bar. Features without an epic go under
a "No epic" group, and stories without a feature under a "No feature" row. Progress is always a count, never a
percentage (ADR 0005).

## Consequences

- The list reads from git and the files every time. The index is only a cache, so a corrupt or deleted index costs one
  slower scan.
- **Limit.** A committed edit to a copy that is not the owner's is not flagged. Git surfaces it as a conflict or a
  change when the branches merge.
- **Limit.** A feature branch that has no worktree can't be the target of Apply; the user checks it out first.
- `fs.watch` with `recursive` is native on Windows and macOS, and supported on Linux by Node 20 and later.
- Each scan runs a few git commands per location. That is fine for M1's handful of worktrees, but a repository with
  many branches may need the index to remember each tree's id and skip unchanged ones.
- The card pane (STORY-4), the board and burn-up (FEAT-7), and PR and CI data (FEAT-6) build on this list. Until FEAT-6
  lands, the PR column shows only the card's own `pr` field.
