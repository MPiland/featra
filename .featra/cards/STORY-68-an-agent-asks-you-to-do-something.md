---
id: STORY-68
type: story
title: An agent asks you to do something
status: New
parent: FEAT-20
order: 3
origin: added
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-18T23:30:00Z
history:
  - at: 2026-11-18T23:30:00Z
    field: status
    from: null
    to: New
    by: dev-lead
---

## Description

As a builder, when an agent needs me to do something only I can do (run a command, sign in, change a setting), it asks me through Featra instead of burying it in its text, and waits until I say it's done.

## Acceptance criteria

- [ ] The Featra MCP has a tool to ask the user to do something, with what to do and any command to run; its description teaches agents when to use it
- [ ] The request shows in the chat as a card with the steps, a Copy button for each command, Done, and Can't do it with a reason
- [ ] The agent waits until the user answers; Done or the reason goes back to the agent as the tool's result
- [ ] Like a tool approval, the request goes to the Inbox after it has waited a while, with a notification
- [ ] While the request waits, its agent counts as waiting in the switcher and the badge
- [ ] Featra never runs the command itself

## Tasks

- [ ] MCP: the request tool and its description
- [ ] Server: the request as a pending item, with the same timeout to the Inbox as approvals
- [ ] Client: the request card in the chat and the Inbox
- [ ] Unit and integration tests for each criterion; a journey with the stand-in agent; tests linked on the criteria
- [ ] Decisions recorded for the Dev Lead; move to In Review

## Depends on

- STORY-66 See which projects need you
