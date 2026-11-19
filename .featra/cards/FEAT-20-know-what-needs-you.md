---
id: FEAT-20
type: feature
title: Know what needs you
status: draft
parent: EPIC-3
order: 20
origin: added
created: 2026-11-18T23:30:00Z
history:
  - at: 2026-11-18T23:30:00Z
    field: status
    from: null
    to: draft
    by: dev-lead
---

## Description

With several projects open, the user sees at a glance which projects have work stalled on them, without opening each one or the Inbox. Today the Inbox counts requests across projects, but the project switcher shows nothing, and an agent that wants the user to do something by hand has no way to say so except in its text.

Built in this order: the switcher's marks (STORY-66), then the taskbar and Dock badge (STORY-67), then a way for an agent to ask the user to do something (STORY-68).

## Notes

Out of scope: failed CI or merge conflicts with no agent on them; agents fix those. A finished turn that is waiting for a reply doesn't count.

## Decisions

Made by the user on 2026-11-18 (decisions.md).

- **Waiting agents (urgent):** an agent stalled on the user: an unanswered question, a tool approval (inline or in the Inbox), or a request to do something (STORY-68). The count is of agents, not requests.
- **Reviews (quiet):** a draft feature to review, or a story at Acceptance. Shown with a separate, quieter mark, not in the count.
- **Switcher:** the closed switcher shows a dot when another project needs the user; the menu shows each project's count and review mark.
- **Taskbar and Dock:** a badge with the number of waiting agents across all projects.
- **Asking the user to do something:** a Featra MCP tool, not guessed from the agent's text.

## Depends on

- FEAT-19 Installers
