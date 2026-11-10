---
id: BUG-13
type: bug
title: New chat looks like an input
status: In Review
parent: FEAT-3
order: 0
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: claude/bug-13-new-chat
pr: 17
created: 2026-11-10T03:05:28Z
history:
  - at: 2026-11-10T03:05:28Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-10T03:05:28Z
    field: status
    from: New
    to: In Progress
    by: session:bug-13
  - at: 2026-11-10T03:14:45Z
    field: status
    from: In Progress
    to: In Review
    by: session:bug-13
---

## Description

The sidebar's New chat button (STORY-5) has a thin border, left-aligned text and no fill, so it reads as a text input. It should look like the nav rows below it (Work, Inbox): a + icon and the label, with hover, focus and a clear disabled state, as in other ADEs.

## Acceptance criteria

- [ ] The New chat control reads as a button: a "+" icon and the label, in the sidebar's nav-row style, with no input-like border.
- [ ] Hover and focus are visible, and disabled is clear when no project is open.
- [ ] It still opens the New chat dialog.

## Tasks

## Notes
