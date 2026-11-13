# 0036 — Filing and placing bugs

Date: 2026-11-12 · Status: proposed

## Context

Bugs are found while work is under way, by the Dev Lead (often from a story session's report) or by the user. Where a
bug belongs depends on what caused it. `routeProblem` in work-format already says where: a task on a story still being
worked, a bug card under the feature in progress, or the project bug list. A Done feature must stay Done: it is never
reopened or given new children. A bug card is a card like any other, owned by one copy (ADR 0002), which may be a
feature branch that isn't checked out. Nothing about filing needs GitHub.

## Decision

- **One proposal, confirmed by the user.** `routeProblem` is the only source of the proposal. The choices are a bug
  under each feature whose status is active, a task on each story or bug whose stage is active, and the project bug
  list (`bugPlacements`). The user keeps the proposal or picks another choice, then Creates or Cancels. Nothing is
  written before Create. At Create the server reads the cards again and refuses a place that is no longer offered
  (`placementRefusal`), so a feature that went Done meanwhile is never written to.
- **Places as keys.** A place is `project`, `feature:FEAT-N` or `task:STORY-N`. The client and the server share these
  keys, and the server is the only one that turns a key into a write.
- **The Dev Lead's `report_bug`** works like `request_merge` (ADR 0034). It takes a title, a description and an
  optional suspected cause. The server proposes a place and puts an approval card in the Dev Lead's chat and the Inbox.
  The call answers at once. A notice tells the Dev Lead the outcome: filed (and where), declined, or not filed (and
  why). Story sessions are refused. They tell the Dev Lead instead.
- **The place travels on the approval.** `chat.approve` takes an optional `option` with Allow. The approval desk
  accepts it only when it is one of the `choices` in the request's input, and refuses anything else (`badOption`) so
  the card stays waiting. Other tools ignore it.
- **New bug in Work** asks `bug.propose` again whenever the suspected cause changes. It then calls `bug.file` with the
  chosen key. It is the user's click (`by: user`). The Dev Lead's bugs are `by: session:<lead>`.
- **What is written.**
  - A bug card is created at the first stage, with `origin: bug`, and its description ends with "Suspected cause: ID
    title". There is no new frontmatter field.
  - Under a feature in progress, the card joins after the scope baseline, so it counts as added scope, and as an open
    bug.
  - A task (`Fix bug: title`) is appended to the story at its owner, with a `content` history event for its tasks.
- **IDs and owners.** The server allocates `BUG-N` past every ID in every copy, in the card lane. The new card goes to
  its owner's copy, given by `ownerOf`: the feature branch for a bug under an active feature, main for a project bug.
  - Where the owner is checked out, the file is written there, uncommitted, like every card edit. A name already
    taken allocates again.
  - Where it isn't, the card is committed on the owner's branch with plumbing (`BUG-N: bug filed`, `STORY-N: bug task
    added`), with the same helper Abandon uses (`commitCardOn`, extracted from STORY-58). No checkout is touched.
- **The project bug list.** The Work list carries `bugs`: bugs with no feature, in order. It is left out when there
  are none. Work shows it after the epics, as "Project bugs", and bug rows have a bug icon wherever they are.

## Consequences

- A bug filed on a feature branch that isn't checked out is a local commit there, until the user pushes or merges.
- A project bug is uncommitted on main, as any card edit there would be.
- The approval desk understands one more field. A request that carries `choices` can take a choice. Other requests
  can't.
- A Done feature's bugs are always project bugs. Work shows them apart from the feature, and the feature's progress
  and Done status don't change.
