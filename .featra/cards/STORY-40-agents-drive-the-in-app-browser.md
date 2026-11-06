---
id: STORY-40
type: story
title: Agents drive the in-app browser
status: New
parent: FEAT-10
order: 4
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-05T23:42:12Z
history:
  - at: 2026-11-05T23:42:12Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I let an agent open, read and use the same in-app browser pane I see, so it can check its own UI work, and I can watch or take over.

## Acceptance criteria

- [ ] Featra exposes browser tools over MCP (open a URL, read page text and the accessibility tree, click, type, screenshot, console messages), usable by any MCP-capable agent
- [ ] The tools are off by default and switched on per project or per chat, so they cost no context tokens unless enabled
- [ ] The agent drives the browser pane the user sees; the user can watch, and any user input in the pane pauses the agent until the user hands it back
- [ ] Only local hosts and hosts the user allowed are opened; other sites ask the user first

## Tasks

- [ ] Break down when picked up

## Notes
