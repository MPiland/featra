---
id: STORY-5
type: story
title: Start a session from a role preset
status: New
parent: FEAT-3
order: 1
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

As a builder, I start a chat from a role preset and work with the agent in a normal chat view.

## Acceptance criteria

- [ ] Starting a session from a preset runs Claude with the preset's prompt, model and reasoning
- [ ] Chat view streams messages and shows tool approval prompts
- [ ] AskUserQuestion from the agent appears as a question card and the answer returns to the session
- [ ] Tool activity is collapsed into one-line summaries that expand on click
- [ ] A tool approval waits inline in the chat and moves to the Inbox after the configured wait

## Tasks

- [ ] Break down when picked up

## Notes
