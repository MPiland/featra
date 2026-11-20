---
id: STORY-67
type: story
title: A badge on the taskbar and Dock
status: In Review
parent: FEAT-20
order: 2
origin: added
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-67-badge
pr: "79"
created: 2026-11-18T23:30:00Z
history:
  - at: 2026-11-18T23:30:00Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-19T23:52:00Z
    field: status
    from: New
    to: In Progress
    by: dev
  - at: 2026-11-20T00:43:39Z
    field: status
    from: In Progress
    to: In Review
    by: dev
  - at: 2026-11-20T03:40:00Z
    field: content
    from: '{"criteria":["The Dock icon on macOS and the taskbar button on Windows show the number of waiting agents across all projects, the same count the switcher uses","On Linux, desktops that support a count show it","The badge clears when no agent is waiting, and updates live","Reviews don''t change the badge"]}'
    to: criteria
    by: user
---

## Description

As a builder working in another app, I see on Featra's taskbar button or Dock icon how many agents are waiting on me, so I know when to come back.

## Acceptance criteria

- [x] The Dock icon on macOS and the taskbar button on Windows show the number of waiting agents across all projects, the same count the switcher uses (test: packages/work-format/test/project-needs.test.ts::STORY-67 AC1, AC3, AC4: waitingTotal is the badge's number, the switcher's counts summed across projects > adds every open project's waiting agents, packages/server/test/waiting-total.test.ts::AC1: the badge counts the waiting agents across every open project, as the switcher does > starts at 0, then adds each project's waiting agents, an agent with two requests once, packages/server/test/waiting-total.test.ts::AC1: the badge counts the waiting agents across every open project, as the switcher does > is the sum of the counts the switcher gets from the same watch, packages/server/test/waiting-total.test.ts::AC1: the badge counts the waiting agents across every open project, as the switcher does > leaves out an agent of a project that is closed, packages/server/test/waiting-total.test.ts::AC1: the badge counts the waiting agents across every open project, as the switcher does > counts an agent once when its folder is listed in two cases where case doesn't matter, packages/server/test/allowed-projects.test.ts::the allowed projects' folders > lists a folder once where case doesn't matter, as the host first spelled it, packages/server/test/allowed-projects.test.ts::the allowed projects' folders > keeps folders that differ in case apart where case matters, packages/server/test/allowed-projects.test.ts::the allowed projects' folders > lists a folder sent twice once, apps/desktop/test/badge.test.ts::AC1: the Dock icon and the taskbar button show the number of waiting agents > puts the number on the Dock icon on macOS, however large, apps/desktop/test/badge.test.ts::AC1: the Dock icon and the taskbar button show the number of waiting agents > draws the number over the taskbar button on Windows, with what a screen reader hears, apps/desktop/test/badge.test.ts::AC1: the Dock icon and the taskbar button show the number of waiting agents > draws 9+ past nine on Windows, and says the whole number, apps/desktop/test/badge.test.ts::AC1: the Dock icon and the taskbar button show the number of waiting agents > makes no other OS's call, apps/desktop/test/badge.test.ts::AC1: the Dock icon and the taskbar button show the number of waiting agents > does nothing on macOS without a Dock, apps/desktop/test/badge-image.test.ts::AC1: the taskbar overlay draws the count on a red disc > says the count up to nine, then 9+, apps/desktop/test/badge-image.test.ts::AC1: the taskbar overlay draws the count on a red disc > is a 32-pixel square in BGRA, clear outside the disc and red inside it, apps/desktop/test/badge-image.test.ts::AC1: the taskbar overlay draws the count on a red disc > draws each label in white, centred in the disc, two glyphs wider than one, apps/desktop/test/badge-image.test.ts::AC1: the taskbar overlay draws the count on a red disc > draws a different picture for each label, apps/desktop/test/badge-image.test.ts::AC1: the taskbar overlay draws the count on a red disc > has white on red at 4.5:1 or more, so the number reads at 16 pixels, packages/server/test/host-messages.test.ts::the server's waiting message > carries a whole count of 0 or more, packages/server/test/host-messages.test.ts::the server's waiting message > is dropped with a count that isn't one, apps/desktop/test/server-process.test.ts::the server child process > tells main how many agents wait on the user, 0 at the start, and 0 again once it stops (STORY-67), apps/desktop/e2e/taskbar-badge.spec.ts::the badge counts the agents waiting across projects, leaves reviews out, and clears as they are answered)
- [x] On Linux, desktops that support a count show it (test: apps/desktop/test/badge.test.ts::AC2: on Linux, desktops that support a count show it > sets the launcher's count, apps/desktop/test/badge.test.ts::AC2: on Linux, desktops that support a count show it > keeps setting it on a desktop with none, and logs that once, apps/desktop/e2e/taskbar-badge.spec.ts::the badge counts the agents waiting across projects, leaves reviews out, and clears as they are answered)
- [x] The badge clears when no agent is waiting, and updates live (test: packages/work-format/test/project-needs.test.ts::STORY-67 AC1, AC3, AC4: waitingTotal is the badge's number, the switcher's counts summed across projects > is 0 with nothing waiting or no project open, packages/server/test/waiting-total.test.ts::AC3: the badge clears when no agent is waiting, and updates live > drops by one as each agent is answered, and clears at none, apps/desktop/test/badge.test.ts::AC3: the badge clears when no agent is waiting, and updates live > clears the Dock badge, the overlay and the launcher count at 0, apps/desktop/test/badge.test.ts::AC3: the badge clears when no agent is waiting, and updates live > calls the OS only when the count changes, and not at all for 0 at the start, apps/desktop/test/badge.test.ts::AC3: the badge clears when no agent is waiting, and updates live > puts the overlay back on a window shown again, and nothing when none is waiting, apps/desktop/test/badge.test.ts::AC3: the badge clears when no agent is waiting, and updates live > takes a count that isn't a whole number above 0 as none, apps/desktop/test/server-process.test.ts::the server child process > tells main how many agents wait on the user, 0 at the start, and 0 again once it stops (STORY-67), apps/desktop/test/server-process.test.ts::the server child process > takes no 0 from a stopped server once the next one is running: that one reports its own (STORY-67), apps/desktop/test/badge-window.test.ts::the badge on a window shown again > is set again when the window shows, and again once its taskbar button exists, apps/desktop/test/badge-window.test.ts::the badge on a window shown again > waits no longer than a quarter second for the button, apps/desktop/test/badge-window.test.ts::the badge on a window shown again > is set again when the window is restored or focused, apps/desktop/test/badge-window.test.ts::the badge on a window shown again > is left alone while the window is hidden, apps/desktop/e2e/taskbar-badge.spec.ts::the badge counts the agents waiting across projects, leaves reviews out, and clears as they are answered)
- [x] Reviews don't change the badge (test: packages/work-format/test/project-needs.test.ts::STORY-67 AC1, AC3, AC4: waitingTotal is the badge's number, the switcher's counts summed across projects > leaves reviews out: a project with only work to review adds nothing, packages/server/test/waiting-total.test.ts::AC4: reviews don't change the badge > keeps the count when a project gains a draft feature to review, with an agent waiting, apps/desktop/e2e/taskbar-badge.spec.ts::the badge counts the agents waiting across projects, leaves reviews out, and clears as they are answered)
- [x] The tray icon shows when agents are waiting, and its tooltip says how many (e.g. "2 agents waiting"); it returns to the plain icon at 0 (test: apps/desktop/test/tray-badge.test.ts::AC5: the tray icon shows when agents are waiting, and its tooltip says how many > puts the dot on the icon and the count in the tooltip, apps/desktop/test/tray-badge.test.ts::AC5: the tray icon shows when agents are waiting, and its tooltip says how many > returns to the plain icon at 0, apps/desktop/test/tray-badge.test.ts::AC5: the tray icon shows when agents are waiting, and its tooltip says how many > sets the tray only when the count changes, and not at all for 0 at the start, apps/desktop/test/tray-badge.test.ts::AC5: the tray icon shows when agents are waiting, and its tooltip says how many > takes a count that isn't a whole number above 0 as none, apps/desktop/test/tray-badge.test.ts::AC5: the tray icon shows when agents are waiting, and its tooltip says how many > gives a tray made later the current count, and a new plain tray nothing, apps/desktop/test/tray-badge.test.ts::AC5: the tray icon shows when agents are waiting, and its tooltip says how many > leaves a removed tray alone, apps/desktop/test/badge-image.test.ts::AC5: the tray icon with agents waiting has a red dot > draws an opaque red dot in the bottom-right corner, apps/desktop/test/badge-image.test.ts::AC5: the tray icon with agents waiting has a red dot > leaves the rest of the icon as it was, and the icon given untouched, apps/desktop/test/badge-image.test.ts::AC5: the tray icon with agents waiting has a red dot > cuts a clear ring around the dot, so it reads on any icon, apps/desktop/e2e/taskbar-badge.spec.ts::the badge counts the agents waiting across projects, leaves reviews out, and clears as they are answered)

## Tasks

- [x] Desktop: the badge from the server's total (macOS `app.dock.setBadge`, Windows taskbar overlay icon with an accessible description, Linux `setBadgeCount`)
- [x] Unit tests for the count and the platform calls; a journey per platform on CI; tests linked on the criteria
- [x] Tray: a red dot on the icon and the count in its tooltip while agents wait (added scope)
- [x] Decisions recorded for the Dev Lead; move to In Review

## Depends on

- STORY-66 See which projects need you
