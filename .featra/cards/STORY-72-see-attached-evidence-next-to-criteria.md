---
id: STORY-72
type: story
title: See attached evidence next to criteria
status: In Progress
parent: FEAT-9
order: 5
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-72-evidence
pr: null
created: 2026-11-23T12:00:00Z
history:
  - at: 2026-11-23T12:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-24T13:18:59Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
---

## Description

As a builder, I see the evidence an agent attached to a criterion, such as a screenshot, right next to it.

## Acceptance criteria

- [x] A screenshot attached to a criterion shows as a thumbnail next to it on the approval screen and in the story's card pane (test: packages/client/test/components/ac-evidence.test.tsx::a screenshot shows as a thumbnail next to its criterion (STORY-72 AC1) > in the card pane, read from the story's own evidence through the server; packages/client/test/components/ac-evidence.test.tsx::the review screen shows the same evidence (STORY-72 AC1, AC2, AC3, AC4) > shows the thumbnail, the link and the notes beside each criterion; packages/server/test/evidence-files.test.ts::AC1: a linked screenshot reads back as an image > gives the card pane and the review screen each criterion's evidence link; packages/server/test/evidence-files.test.ts::AC1: a linked screenshot reads back as an image > reads a screenshot in the story's worktree as an image, bytes and all; packages/server/test/evidence-files.test.ts::AC1: a linked screenshot reads back as an image > reads a merged story's screenshot from git when its owner isn't checked out; packages/server/test/evidence-files.test.ts::the local API's evidence methods > reads and opens through evidence.read and evidence.open; packages/work-format/test/evidence-link.test.ts::AC1: which evidence files are screenshots > keeps a criterion's evidence link through the socket, and drops one that isn't text; apps/desktop/e2e/evidence-attached.spec.ts::Evidence by its criteria: a thumbnail opens full size, Escape closes it, a file opens, a missing one says so)
- [x] Clicking a thumbnail opens it full size, and Escape closes it (test: packages/client/test/components/ac-evidence.test.tsx::a thumbnail opens full size, and Escape closes it (STORY-72 AC2) > opens the screenshot over the app; Escape closes it, returns focus, and leaves the card open; packages/client/test/components/ac-evidence.test.tsx::a thumbnail opens full size, and Escape closes it (STORY-72 AC2) > closes with its Close button too; packages/client/test/components/ac-evidence.test.tsx::the review screen shows the same evidence (STORY-72 AC1, AC2, AC3, AC4) > shows the thumbnail, the link and the notes beside each criterion; apps/desktop/e2e/evidence-attached.spec.ts::Evidence by its criteria: a thumbnail opens full size, Escape closes it, a file opens, a missing one says so)
- [x] Other attached files show as a link that opens the file (test: packages/client/test/components/ac-evidence.test.tsx::another file shows as a link that opens it (STORY-72 AC3) > opens the server's copy of the file with the OS; packages/client/test/components/ac-evidence.test.tsx::the review screen shows the same evidence (STORY-72 AC1, AC2, AC3, AC4) > shows the thumbnail, the link and the notes beside each criterion; packages/server/test/evidence-files.test.ts::AC3: any other file reads back as a file to open > reads a text file as a file, by name; packages/server/test/evidence-files.test.ts::AC3: any other file reads back as a file to open > opens a copy in the app's data folder, never the original; packages/server/test/evidence-files.test.ts::AC3: any other file reads back as a file to open > opens a merged story's file from git; packages/work-format/test/evidence-link.test.ts::AC3: other files open with the OS only when they can't run > opens documents and images, never programs or pages; apps/desktop/test/evidence-open.test.ts::evidenceOpening > opens a document copied into the evidence folder; apps/desktop/test/evidence-open.test.ts::evidenceOpening > shows a program or a page in its folder rather than run it; apps/desktop/test/evidence-open.test.ts::evidenceOpening > refuses anything that isn't a path; apps/desktop/test/evidence-open.test.ts::evidenceOpening > refuses a link in the evidence folder that leads out of it; apps/desktop/e2e/evidence-attached.spec.ts::Evidence by its criteria: a thumbnail opens full size, Escape closes it, a file opens, a missing one says so)
- [x] Evidence that is missing or unreadable says so instead of breaking the criterion (test: packages/client/test/components/ac-evidence.test.tsx::evidence that is missing or unreadable says so (STORY-72 AC4) > shows a short note, and the criterion's text and the rest of the card still show; packages/client/test/components/ac-evidence.test.tsx::evidence that is missing or unreadable says so (STORY-72 AC4) > says so beside a link whose file can't be opened any more; packages/client/test/components/ac-evidence.test.tsx::the review screen shows the same evidence (STORY-72 AC1, AC2, AC3, AC4) > shows the thumbnail, the link and the notes beside each criterion; packages/server/test/evidence-files.test.ts::AC4: evidence that can't be shown says why, and nothing else is read > refuses a symbolic link that leads out of the evidence folder; packages/server/test/evidence-files.test.ts::AC4: evidence that can't be shown says why, and nothing else is read > refuses a symbolic link git has for a merged story; packages/server/test/evidence-files.test.ts::AC4: evidence that can't be shown says why, and nothing else is read > refuses to open what it can't read, with the note the app shows; packages/server/test/evidence-files.test.ts::AC4: evidence that can't be shown says why, and nothing else is read > says a card that isn't there is gone; packages/server/test/evidence-files.test.ts::the local API's evidence methods > refuses bad params, a folder that isn't an open project, and a server without evidence; packages/work-format/test/evidence-link.test.ts::AC4: what crosses the socket, read defensively > keeps an image, a file and a problem as they are; packages/work-format/test/evidence-link.test.ts::AC4: what crosses the socket, read defensively > says why in a few words; packages/work-format/test/evidence-link.test.ts::AC4: what crosses the socket, read defensively > takes { dir, id, path } and nothing less; apps/desktop/e2e/evidence-attached.spec.ts::Evidence by its criteria: a thumbnail opens full size, Escape closes it, a file opens, a missing one says so)

## Tasks

- [x] work-format: evidence-link.ts (link rules moved from the card report, image types, copy, the socket shapes)
- [x] server: evidence.read and evidence.open, from the shown copy on disk or in git, linked paths only
- [x] desktop: openEvidence IPC that opens only copies in the data folder, and runs nothing
- [x] client: one AcEvidence in the card pane and the review screen, the full-size overlay, the notes
- [x] e2e journey with screenshots feat9-evidence-thumbnails, feat9-evidence-overlay and feat9-evidence-missing
- [x] ADR 0043 and decisions.md

## Notes

Shaped with the user on 2026-11-23. Agents can already attach evidence under `.featra/evidence/` through `update_card`; the app has never shown it.

## Depends on

- STORY-69 Review a feature on one screen
