# 0041 — What each project needs: one server watch across the open projects

Date: 2026-11-19 · Status: proposed

## Context

STORY-66 shows in the project switcher which projects have agents waiting on the user and which have work to review.
Unlike the Work list, which is watched for the current project only, this has to cover every open project at once and
change live in all of them. The server already holds both inputs: the Inbox hub (STORY-7) holds every open approval
and question of every chat, inline or not, with the chat's project. The shared per-folder scan watches (ADR 0015) give
each project's Work list, with its review rows (a drafted feature's `review`, a story's `awaiting`). STORY-67 (a
taskbar badge) and STORY-68 (an agent asks the user to do something) will build on the same count.

## Decision

- **The rules are pure functions in work-format** (`project-needs.ts`): `waitingAgents` counts the distinct chats with a
  held request, `hasReview` reads the Work list's own review rows, and `othersNeedingYou` counts the other projects the
  closed switcher's dot is for. A new request kind counts as soon as the Inbox hub holds it, so STORY-68 plugs in
  without a new rule.
- **One shared server service, `createProjectNeeds`, behind one watch method, `needs.watch`.** The method answers
  `{ projects: { dir, waiting, review }[] }` for every allowed project and pushes `needs.list` with the whole list when
  any project's numbers change, until `work.unwatch`. The first watch starts the service, and it runs until the server
  closes. It holds the Inbox hub's requests at wait 0 and one shared folder watch per open project, through
  `watchProjects` like the story checks and PR watches. So a project is started and stopped with the project list, and
  one whose watch fails is tried again at the next change of the list. Requests match projects by `projectKey`, so a
  path in another case counts on case-insensitive file systems.
- **The answer comes at once.** It has the waiting counts, and the review marks of the scans that have landed; a
  project not scanned yet has none until its scan lands and is pushed. A project whose scan is slow never holds up the
  others, and a page that reconnects gets the numbers the service already has, with no new scans.
- **The client only renders.** The bridge's `needs` watch feeds the switcher: counts and review marks on the menu's
  project items and the dot on the closed switcher, with the meaning in their accessible names.

## Consequences

- One small push per change, of a list as long as the open projects, so the client never asks per project.
- The first answer can show no review mark for a project that has one, for as long as its first scan takes.
- Each open project keeps a folder watch while Featra runs, shared with the Work list when it is the current project.
- STORY-67's badge can sum `waiting` from the same push; STORY-68's request counts once it is an Inbox request.
