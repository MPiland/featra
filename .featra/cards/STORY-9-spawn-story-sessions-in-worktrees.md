---
id: STORY-9
type: story
title: Spawn a story agent
status: In Review
parent: FEAT-5
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-9-spawn-agent
pr: "27"
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-11T09:00:00Z
    field: status
    from: New
    to: In Progress
    by: developer
  - at: 2026-11-11T18:00:00Z
    field: status
    from: In Progress
    to: In Review
    by: developer
---

## Description

As the user or the Dev Lead, I start a story's agent in its own worktree, with the Dev Lead's permissions, so it can work without me approving each step.

## Acceptance criteria

- [x] The story row's Start button and the Dev Lead's `spawn_session(story, role, model, effort)` create a worktree off the feature branch where the provider keeps worktrees (Claude: `<repo>/.claude/worktrees/STORY-N-slug`, excluded through `.git/info/exclude`), and the story card's ownership moves to it (test: packages/server/test/story-spawn.test.ts::AC1 and AC4: the Start button > cuts the worktree off the feature branch, moves the card to it, and nests the session under the feature's chat; packages/mcp/test/spawn.test.ts::spawn_session through the Featra MCP > sends the story, role, model, effort and brief for the calling chat, and says it started)
- [x] The session starts in that worktree; its first message is the role's template plus the card (description, ACs, tasks, branch, worktree, pointers to CONTEXT.md and decisions.md) and any brief the Dev Lead passed (test: packages/server/test/story-spawn.test.ts::AC1 and AC4: the Start button > starts the agent in the worktree with the role template, the card, branch, worktree and pointers as the first message; packages/server/test/story-spawn.test.ts::AC2: the Dev Lead's brief > is part of the first message when spawn_session gives one, and the card says who started it)
- [x] The story session inherits the Dev Lead's permission mode and always-allow rules; an approval it still needs shows in the Dev Lead's chat labelled with the story, then in the Inbox (test: packages/server/test/story-permissions.test.ts::AC3: inheriting the Dev Lead's permissions > gives the session the lead's permission mode and the allow rules it was given for the chat; packages/server/test/story-permissions.test.ts::AC3 and AC7: an approval the session still needs > shows in the lead's chat labelled with the story on every client, is answered there, and reaches the Inbox; packages/client/test/components/story-approval.test.tsx::AC3: an approval a story session still needs > is labelled with the story in the Dev Lead's chat, and Allow answers it)
- [x] The story goes In Progress; its row shows the agent, model and a link to the session; the session nests in the sidebar under the feature's chat, or under a group named after the feature if that chat is gone (test: packages/server/test/story-spawn.test.ts::AC1 and AC4: the Start button > cuts the worktree off the feature branch, moves the card to it, and nests the session under the feature's chat; packages/client/test/components/start-story.test.tsx::AC4: Start on a story row > starts the story with no confirmation, and the row then shows its agent, model and a link that opens the session; packages/client/test/components/start-story.test.tsx::AC4 and AC5: where the session is, and Queued > puts the session under a group named after the feature when no Dev Lead chat is listed; packages/work-format/test/chat-nest.test.ts::nestChats > puts sessions whose chat is gone, or that had none, in one group named after their feature)
- [x] At most N story sessions run at once (project setting, default 3); further spawns show Queued and start in order (test: packages/server/test/story-queue.test.ts::AC5: the limit of story agents at once > starts the first, queues the rest in order, and shows Queued on the sessions; packages/server/test/story-queue.test.ts::AC5: the limit of story agents at once > starts the next in order as the running session ends its turn, and the one after as that ends)
- [x] Spawning goes through the provider interface; a provider with no runner refuses with a clear message (test: packages/server/test/story-runner.test.ts::AC6: a provider that can't run story sessions > refuses a provider with no worktree location, makes nothing, and leaves no chat behind; packages/server/test/story-spawn.test.ts::AC6: a role that can't run the story > is refused in one sentence, and no worktree is made)
- [x] `spawn_session` needs no confirmation that only the desktop window can give: it follows the Dev Lead's permissions, and any approval it needs reaches every connected client and the Inbox (test: packages/server/test/story-permissions.test.ts::AC3 and AC7: an approval the session still needs > shows in the lead's chat labelled with the story on every client, is answered there, and reaches the Inbox (two WebSocket clients))

## Tasks

- [x] Pure rules in work-format: who may start a story, the worktree name, nesting of story sessions in the sidebar (test: packages/work-format/test/story-start.test.ts, chat-nest.test.ts)
- [x] Provider seam: worktree location per provider, inherited permissions, no runner refuses (test: packages/server/test/story-runner.test.ts)
- [x] Story runner: worktree, card move, first message, slot limit and queue (test: story-spawn.test.ts, story-queue.test.ts)
- [x] Story card written onto the feature branch with the plumbing commit (note 3; test: packages/server/test/story-added.test.ts)
- [x] Approvals of a story session shown in the lead's chat and in the Inbox (test: story-permissions.test.ts)
- [x] `spawn_session` MCP tool and agent socket call (test: packages/mcp/test/spawn.test.ts)
- [x] Start button in the row and card pane, agent link, Queued, sidebar nesting, `maxStoryAgents` setting (test: packages/client/test/components/start-story.test.tsx)
- [x] ADR 0025 and the Playwright journey (written, run in CI only: apps/desktop/e2e/start-story.spec.ts)

## Notes

- 2026-11-10 (dev-lead): Reshaped with the user: story agents are Featra-run provider sessions that behave like subagents (see decisions.md).
- 2026-11-10 (dev-lead): added the remote-safe criterion with the user, so a Dev Lead prompted from a remote client (M2) can still spawn stories.
- 2026-11-10 (dev-lead): A story added to a started feature must be written to the feature branch (owner); today it shows from main with the 'isn't in its owner' problem line. Decide where it is written as part of this story.
- 2026-11-11 (developer): Note 3: a story not yet on its feature branch is committed onto it (`STORY-N: added to FEAT-M`, ref guarded by the old tip). If the branch is checked out somewhere, nothing is committed and the card goes into the new worktree only. Queued sessions are not saved: a restart forgets them. See ADR 0025.
