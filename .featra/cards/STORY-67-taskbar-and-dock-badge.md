---
id: STORY-67
type: story
title: A badge on the taskbar and Dock
status: New
parent: FEAT-20
order: 2
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

As a builder working in another app, I see on Featra's taskbar button or Dock icon how many agents are waiting on me, so I know when to come back.

## Acceptance criteria

- [ ] The Dock icon on macOS and the taskbar button on Windows show the number of waiting agents across all projects, the same count the switcher uses
- [ ] On Linux, desktops that support a count show it
- [ ] The badge clears when no agent is waiting, and updates live
- [ ] Reviews don't change the badge

## Tasks

- [ ] Desktop: the badge from the server's total (macOS `app.dock.setBadge`, Windows taskbar overlay icon with an accessible description, Linux `setBadgeCount`)
- [ ] Unit tests for the count and the platform calls; a journey per platform on CI; tests linked on the criteria
- [ ] Decisions recorded for the Dev Lead; move to In Review

## Depends on

- STORY-66 See which projects need you
