---
id: STORY-57
type: story
title: Proven from a CI test report
status: In Review
parent: FEAT-6
order: 4
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-11T20:00:00Z
history:
  - at: 2026-11-11T20:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-12T20:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:story-57
  - at: 2026-11-12T22:00:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-57
---

## Description

As a builder whose checks run on CI, criteria are Proven by the test results CI already produces.

## Acceptance criteria

- [x] A project setting names the test report CI uploads (JUnit XML); Proven from CI is off until it is set (test: packages/server/test/story-prs-proven.test.ts::the test report setting (AC1) > is off until the artifact is set: checks finishing read no report, then do once it is set; packages/work-format/test/ci-proof.test.ts::the test report setting (AC1) > is off until the artifact is set; packages/client/test/components/settings/ProjectChecks.test.tsx::STORY-57 AC1: the test report CI uploads > is empty until set, and saves the artifact and the report files; apps/desktop/e2e/ci-proven.spec.ts)
- [x] When a PR's checks finish, Featra reads the report and marks Proven each criterion whose linked test passed (test: packages/server/test/story-prs-proven.test.ts::reading the report when checks finish (AC2) > marks Proven, by system, each criterion whose linked test passed, merging every job's report; packages/server/test/story-prs-proven.test.ts::reading the report when checks finish (AC2) > reads once per head: later polls fetch nothing, a re-run of the checks is read again; packages/server/test/ci-report.test.ts; packages/work-format/test/ci-proof.test.ts::what CI's report proves of a story (AC2, AC3) > proves each criterion whose linked test passed, an end-to-end test included; apps/desktop/e2e/ci-proven.spec.ts)
- [x] A criterion whose linked test failed or is missing from the report stays unproven, and the card says which (test: packages/server/test/story-prs-proven.test.ts::criteria the report didn't prove (AC3) > stay unproven, and the card says which failed, which are missing, and why; packages/server/test/story-prs-proven.test.ts::criteria the report didn't prove (AC3) > takes Proven away when the test fails or is missing on a new head, with the reason; packages/client/test/components/ci-proven.test.tsx; apps/desktop/e2e/ci-proven.spec.ts)

## Tasks

- [x] Rules in work-format: report settings in config (`testReportArtifact`, `testReportFiles`), merging several reports, matching a linked test to a report case by file and full name, each criterion's verdict (proven, failed, missing) with why
- [x] Server: find the runs of the PR's head through `gh run list --commit`, download the report artifact with `gh run download` into a temp folder, read the matching XML files within a size bound, clean up
- [x] Server: read once per head when the PR's checks finish, only when checks run in CI and the report is set; record Proven and unproven by system through the shared evidence writer; keep what the card shows
- [x] Settings: Test report fields in Project settings > Checks (artifact and files), through the checks bridge
- [x] Card: criteria whose test failed or is missing from the report say so, with the reason in the PR section
- [x] CI: the Gate's unit tests also write a JUnit report, uploaded as an artifact, so Featra can read its own
- [x] Unit, integration and component tests for each criterion; Playwright journey; tests linked on the criteria
- [x] Decisions recorded for the Dev Lead; ADR 0033; move to In Review

## Notes

Build choices are in decisions.md, "2026-11-12 — STORY-57 build choices". ADR 0033 (proposed).

## Depends on

- STORY-11 Story PR and PR chip
