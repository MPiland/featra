# 0025 — Story agents are Featra-run sessions, each in its own worktree

Date: 2026-11-11 · Status: accepted

## Context

A started feature (ADR 0024) has a branch and stories. STORY-9 lets the user (a Start button) or the Dev Lead (the MCP
tool `spawn_session`) put an agent on one story. The lead's design: a story agent is a normal Featra chat session run
through the provider interface (ADR 0018), not a provider's native subagent, so that its worktree, its permissions and
its approvals are Featra's to manage and nothing in the flow is provider-specific.

## Decision

- **One server method, `story.spawn`** on the agent socket (`{story, role?, model?, effort?, brief?}`) and `story.start`
  on the window socket (`{dir, id}`), both ending in `createStorySpawn`. The Dev Lead is the calling chat (its secret,
  ADR 0019); for the button it is `draftedBy(feature)`, kept as the session's parent even when that chat is gone.
- **Where the worktree is is the provider's to say.** `ProviderAdapter.worktrees` is `{folder(repo, name), ignore}`.
  Claude's is `<repo>/.claude/worktrees/STORY-N-slug`, excluded through `.git/info/exclude` (`.claude/worktrees/`, added
  once; never `.gitignore`). A provider without it has no runner: spawning refuses with "This role's agent can't run
  story sessions yet." A role whose provider isn't installed refuses with the existing "isn't available".
- **The worktree and its branch.** `git worktree add -b featra/story-N-slug <folder> <feature branch>`: cut from the
  feature's branch, and the branch name maps back to the story (`itemIdOfBranch`), so ownership moves to the worktree by
  the existing rules (ADR 0002), with no UI special case. A feature that isn't active, or has no branch, refuses in one
  sentence ("FEAT-N isn't started yet. Start it first."), as does a story that isn't New or Ready, or isn't a story.
  A failure after the worktree exists removes the worktree and the branch: all or nothing.
- **The card is written in the worktree, uncommitted**, as the owner's copy: In Progress with a status event (`by: user`
  from the button, `by: session:<chat>` from the MCP), `agent`, `model`, `reasoning` and `sessions[]`. The row in Work
  reads those. It is committed by the story agent with the rest of its work.
- **Note 3: a story added after the feature started.** Such a card lives only in the base branch (or wherever it was
  written), so a branch cut from the feature branch would not have it. Spawning first commits the card, unchanged, onto
  the feature branch with the ADR 0024 plumbing (`card-commit.ts`, shared with Start; `update-ref` with the old tip as the
  guard), as `STORY-N: added to FEAT-M`, inside the card lane. When the feature branch is checked out in some worktree
  the ref is not moved under it: the card is written into the new worktree instead. The feature branch's copy of the
  card is never edited otherwise.
- **The first message** is built by `storyFirstMessage` (pure, work-format): the role's template, the card as its file
  has it (description, criteria, tasks, notes), the branch, the worktree, pointers to CONTEXT.md and decisions.md, and
  the Dev Lead's brief when there is one. It is recorded as the session's first user message, so the user sees it.
- **Permissions are inherited at spawn.** The child starts in the parent's permission mode (where the provider offers it;
  the parent's full access is the ceiling) and with the parent's always-allow rules: Featra's own per-chat rules are
  copied, and the provider's own suggested rules the user allowed for the chat are passed through `SessionOptions.inherited`
  (Claude: `allowedTools`). It is a copy at that moment; later changes to the parent do not follow. `spawn_session` itself
  is a tool of the Featra MCP, which is allowed outright, so it never waits on an approval only the window can give.
- **Approvals a story session still needs** reach every connected client and the Inbox through the existing paths (the
  session is a chat of the project). The Dev Lead's chat also shows a copy of the approval labelled with the story
  (`approval.story`), answered there, and the answer goes to the session's request. The copy is not a second Inbox item:
  the Inbox holds the session's own request, which escalates after the Inbox wait like any other.
- **The limit.** `maxStoryAgents` (project config and Settings, default 3, whole number from 1). A story session holds a
  slot from launch until its turn ends or it ends; spawns beyond the limit are `Queued` (the chat is listed with
  `queued`, nothing can be sent to it, no worktree exists yet) and start in order as slots free. **The queue is in
  memory:** a queued session is not saved, so a restart forgets it and the story stays New or Ready, to be started
  again. A running session is saved and restored like any chat, with its worktree as its folder (`SavedChat.cwd`).
- **In the UI.** Start is on a New or Ready story of an active feature, in its Work row and in its card pane; a refusal is
  one sentence under the button. The row then shows the agent, model and a link that opens the session. The sidebar nests
  a session under its Dev Lead's chat (`story.parent`), or under a group named after its feature when that chat is gone
  (`nestChats`, pure).

## Consequences

Story sessions need nothing of the provider beyond the folder rule and what a session already offers. The queue's
restart behaviour is the simple one; persisting it is a later change if it turns out to matter. Permissions never widen
by delegation: a child cannot hold more than its parent held at spawn.
