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
- **The role and the card.** The card's `agent` is the provider that runs it (`role.provider`) and `role` the role's id;
  the role is the caller's, else the card's own `role`, else the developer. The role's prompt is sent once, as the
  session's system prompt. The **first message** is built by `storyFirstMessage` (pure, work-format): the card as its
  file has it (description, criteria, tasks, notes), the branch, the worktree, pointers to CONTEXT.md and decisions.md,
  and the Dev Lead's brief when there is one. It is recorded as the session's first user message, so the user sees it.
  The card written into the worktree is the owner's copy as it is, uncommitted edits included. Only STORY ids are
  accepted, and the folder and branch are built from the parsed number and the slug, never from the id text.
- **Story sessions don't spawn.** `story.spawn` from a chat that is itself a story session is refused ("A story session
  can't start other story sessions. Ask the Dev Lead."), and the sidebar nests a session only under a parent that is not
  one, falling back to the feature's group.
- **Permissions are inherited when the session launches** (not when it was queued; a lead listed but not yet loaded
  after a restart is loaded first). The child starts in the parent's permission mode (where the provider offers it;
  the parent's full access is the ceiling) and with the parent's always-allow rules: Featra's own per-chat rules are
  copied, and the provider's own suggested rules the user allowed for the chat are passed through `SessionOptions.inherited`
  (Claude: `allowedTools`). It is a copy at that moment; later changes to the parent do not follow. `spawn_session` itself
  is a tool of the Featra MCP, which is allowed outright, so it never waits on an approval only the window can give.
- **Approvals a story session still needs** reach every connected client and the Inbox through the existing paths (the
  session is a chat of the project). The Dev Lead's chat also shows a copy of the approval labelled with the story
  (`approval.story`), answered there, and the answer goes to the session's request. The copy is not a second Inbox item:
  the Inbox holds the session's own request, which escalates after the Inbox wait like any other. The copy follows the
  session's turn, not the Dev Lead's: it stays open when the lead's own turn ends, and closes when the session's turn
  ends or the lead's chat ends. A lead left idle with an answered copy waits for a reply.
- **The limit.** `maxStoryAgents` (project config and Settings, default `DEFAULT_CONFIG.maxStoryAgents`, whole number
  from 1). At most that many story sessions run a turn at once, on **every** turn: a session holds a slot from launch
  until its turn ends, and a later turn (a user or Dev Lead message to an idle session) takes a slot or waits `Queued`
  (the chat is listed with `queued`; stopping it drops the wait) and runs in order as slots free. A session restored
  after a restart takes a slot only while it runs. A spawn beyond the limit is `Queued` too (no worktree exists yet).
  **The queue is in memory:** a queued session is not saved, so a restart forgets it and the story stays New or Ready, to
  be started again. A running session is saved and restored like any chat, with its worktree as its folder
  (`SavedChat.cwd`).
- **Failure.** A start that fails removes the worktree and the branch it made, and says what remains ("Couldn't start
  STORY-N. ... remains ..."). A chat closed while its worktree was being made leaves no worktree, branch or In Progress
  card. A branch left from an earlier start is reused when no worktree has it checked out, and refused in one sentence
  when one does. The provider's worktree folder is excluded through the repository's own `info/exclude`, also when the
  project is a linked worktree.
- **In the UI.** Start is on a New or Ready story of an active feature, in its Work row and in its card pane; a refusal is
  one sentence under the button. The row then shows the agent, model and a link that opens the session. The sidebar nests
  a session under its Dev Lead's chat (`story.parent`), or under a group named after its feature when that chat is gone
  (`nestChats`, pure).

## Consequences

Story sessions need nothing of the provider beyond the folder rule and what a session already offers. The queue's
restart behaviour is the simple one; persisting it is a later change if it turns out to matter. Permissions never widen
by delegation: a child cannot hold more than its parent held at spawn.
