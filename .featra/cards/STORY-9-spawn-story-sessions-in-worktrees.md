---
id: STORY-9
type: story
title: Spawn a story agent
status: New
parent: FEAT-5
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As the user or the Dev Lead, I start a story's agent in its own worktree, with the Dev Lead's permissions, so it can work without me approving each step.

## Acceptance criteria

- [ ] The story row's Start button and the Dev Lead's `spawn_session(story, role, model, effort)` create a worktree off the feature branch where the provider keeps worktrees (Claude: `<repo>/.claude/worktrees/STORY-N-slug`, excluded through `.git/info/exclude`), and the story card's ownership moves to it
- [ ] The session starts in that worktree; its first message is the role's template plus the card (description, ACs, tasks, branch, worktree, pointers to CONTEXT.md and decisions.md) and any brief the Dev Lead passed
- [ ] The story session inherits the Dev Lead's permission mode and always-allow rules; an approval it still needs shows in the Dev Lead's chat labelled with the story, then in the Inbox
- [ ] The story goes In Progress; its row shows the agent, model and a link to the session; the session nests in the sidebar under the feature's chat, or under a group named after the feature if that chat is gone
- [ ] At most N story sessions run at once (project setting, default 3); further spawns show Queued and start in order
- [ ] Spawning goes through the provider interface; a provider with no runner refuses with a clear message
- [ ] `spawn_session` needs no confirmation that only the desktop window can give: it follows the Dev Lead's permissions, and any approval it needs reaches every connected client and the Inbox

## Tasks

- [ ] Break down when picked up

## Notes

- 2026-11-10 (dev-lead): Reshaped with the user: story agents are Featra-run provider sessions that behave like subagents (see decisions.md).
- 2026-11-10 (dev-lead): added the remote-safe criterion with the user, so a Dev Lead prompted from a remote client (M2) can still spawn stories.
- 2026-11-10 (dev-lead): A story added to a started feature must be written to the feature branch (owner); today it shows from main with the 'isn't in its owner' problem line. Decide where it is written as part of this story.
