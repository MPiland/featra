---
id: STORY-75
type: story
title: Annotate the page
status: In Progress
parent: FEAT-10
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-75-annotate
pr: null
created: 2026-11-27T12:00:00Z
history:
  - at: 2026-11-27T12:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-28T01:36:47Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
---

## Description

As a builder, I point at what's wrong on the page, one or more elements or a region I draw, and say what I want changed, so the agent gets exactly what I mean.

## Acceptance criteria

- [ ] In Annotate mode, hovering highlights an element, clicking picks it, Shift-click adds more, and dragging draws a region. Escape leaves the mode
- [ ] Each annotation takes a comment and captures: the elements or region, a screenshot of it, the viewport size, the URL, a CSS selector and a trimmed DOM snippet, key computed styles, and console errors since the page loaded
- [ ] An annotation includes a source-file hint when the page's dev build exposes one (React and Vite first), and leaves it out otherwise
- [ ] Numbered markers stay on their elements through scrolling, resizing and in-page navigation. Clicking a marker edits or deletes its annotation
- [ ] Unsent annotations last until the pane closes. Closing the pane with unsent annotations asks first
- [ ] Capturing costs no tokens

## Tasks

- [ ] Break down when picked up

## Notes

Shaped with the user on 2026-11-27. Annotations are not saved across closing the pane or restarting.
