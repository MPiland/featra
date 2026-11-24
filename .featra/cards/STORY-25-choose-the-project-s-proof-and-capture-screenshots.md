---
id: STORY-25
type: story
title: Choose the project's proof and capture screenshots
status: In Progress
parent: FEAT-9
order: 6
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-25-proof
pr: null
created: 2026-11-05T17:13:05Z
history:
  - at: 2026-11-05T17:13:05Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-24T16:32:50Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
---

## Description

As a builder, I choose once how I want to check stories before accepting them, and get screenshots without extra installs or tokens.

## Acceptance criteria

- [x] When the first feature is shaped, the Dev Lead asks once for the project's proof: screenshots, a Preview button, both, or neither; the answer is a project setting I can change later (test: packages/server/test/proof-question.test.ts::AC1: the proof question > is asked on the question card when the project's first feature is shaped, by the app; packages/server/test/proof-question.test.ts::AC1: the proof question > isn't asked again while it waits, though the feature is shaped again; packages/server/test/proof-question.test.ts::AC1: the proof question > is answered on the card, and the answer is the project's proof, shown in Settings; packages/server/test/proof-question.test.ts::AC1: the proof question > isn't asked again once the project has a proof, for the next feature or another chat; packages/server/test/proof-question.test.ts::AC1: the proof question > is changed in Settings, and not asked again for a later feature once cleared there; packages/server/test/proof-question.test.ts::AC1: no proof question in a project that had a feature before > isn't asked when the feature shaped isn't the project's first; Settings chooses its proof; packages/work-format/test/proof.test.ts::the proof question > offers screenshots, Preview, both or neither, and each answer is a proof; packages/client/test/components/settings/ProjectProof.test.tsx::AC1: the project's proof is a setting > shows the answer to the proof question, and changes it; apps/desktop/e2e/proof-question.spec.ts::The proof question: asked once at the first feature, and the answer shows in Project settings)
- [x] Featra captures screenshots with Electron's built-in Chromium; no browser download or extra dependency (test: packages/server/test/proof-capture.test.ts::AC2: the pages a story's criteria list are captured as it moves to review > attaches each criterion's page and test screenshot, links them, and tells the agent to commit them; packages/server/test/host-capture.test.ts::capturing through the desktop host > numbers each ask and settles it with the host's answer to that number; packages/server/test/dev-servers.test.ts::a story's dev server > starts in the story's worktree with the command, and is reused while it runs; packages/server/test/dev-servers.test.ts::a real dev server through the check runner > starts, answers on the port Featra gave it, and is stopped; packages/work-format/test/proof.test.ts::a page an agent lists on a criterion > is set on the criterion it ticks, and reported as a page to capture; apps/desktop/e2e/proof-capture.spec.ts::Screenshots: a story moved to review gets its page captured from the dev server, shown by its criterion)
- [x] Screenshots produced by the project's own tests are attached to the matching criteria when present (test: packages/server/test/proof-capture.test.ts::AC2: the pages a story's criteria list are captured as it moves to review > attaches each criterion's page and test screenshot, links them, and tells the agent to commit them; packages/work-format/test/proof.test.ts::the test screenshots that match a criterion (the rule: <STORY-ID>-ac<n>[-anything].<image>) > match by story and criterion number from 1, any case, the first by name winning; packages/work-format/test/proof.test.ts::what Featra attaches to each criterion > is the page it lists when screenshots are on, else a test's screenshot; an agent's own evidence stays; packages/work-format/test/proof.test.ts::what Featra attaches to each criterion > is only the tests' screenshots when the project doesn't take screenshots)
- [x] Capturing screenshots spends no agent tokens (test: packages/server/test/proof-capture.test.ts::AC2: the pages a story's criteria list are captured as it moves to review > attaches each criterion's page and test screenshot, links them, and tells the agent to commit them; apps/desktop/e2e/proof-capture.spec.ts::Screenshots: a story moved to review gets its page captured from the dev server, shown by its criterion)
- [x] Captured and attached screenshots show next to their criteria, as STORY-72 shows evidence (test: packages/server/test/proof-capture.test.ts::AC2: the pages a story's criteria list are captured as it moves to review > shows the screenshots on the card, with no note and Preview offered; packages/client/test/components/proof-pane.test.tsx::a screenshot Featra couldn't take is a note on its criterion > says why next to the criterion, with the dev server's last output folded away; apps/desktop/e2e/proof-capture.spec.ts::Screenshots: a story moved to review gets its page captured from the dev server, shown by its criterion)

## Tasks

- [x] Proof settings in the project's config, shown and changed in Settings > Project > Proof, with the dev-server command confirmed there
- [x] Ask the proof question on the Dev Lead's question card when the first feature is shaped
- [x] `update_card` takes a page per criterion
- [x] Dev servers per story worktree: start, reuse, free port, timeout note, stop on end, close and quit (ADR 0044)
- [x] Capture in Electron main over the host channel; attach pages and the tests' screenshots as evidence
- [x] Notes on criteria and the Preview button in the card pane
- [x] E2E journeys: capture with thumbnail, Preview, the question and Settings
- [x] ADR 0044, decisions.md and CONTEXT.md

## Notes

Reshaped with the user on 2026-11-23: the design review of screenshots moved to STORY-73, and showing evidence to STORY-72.

Decided with the user on 2026-11-24 (dev lead):

- Screenshots come from the project's dev server. Project settings name a dev-server command and its URL. When a story moves to review, Featra starts that server in the story's worktree, opens the pages the agent listed for each criterion in a hidden window, captures them with Electron's Chromium, and attaches them as the criterion's evidence. The agent names the pages through its normal `update_card` call; the capture itself spends no tokens.
- Preview starts the story's dev server and opens it in a Featra window, so the builder can try the story before Accept. The full in-app browser with annotations stays on the roadmap.

## Depends on

- STORY-72 See attached evidence next to criteria
