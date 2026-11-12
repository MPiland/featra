# 0033 — Proven from CI's test reports

Date: 2026-11-12 · Status: proposed

## Context

A criterion is Proven when its linked test passed (ADR 0004). Locally, STORY-56 runs the linked tests and reads the
JUnit report they write. A project whose checks run in CI (ADR 0031) already has those results on GitHub, as a report
the workflow uploads. Featra reads GitHub only through the user's `gh` (ADR 0032), and reading results should cost no
agent tokens.

## Decision

- **The project names the report.** `testReportArtifact` is the name of the artifact CI uploads, or a pattern for
  several (`test-report-*`). `testReportFiles` is a path or glob of the JUnit XML inside it, every `.xml` file by
  default. Both are in `.featra/config.yaml` and Project settings > Checks. Proven from CI is off until the artifact is
  set. Both are checked when set, so they are safe as one argument on every platform and can't leave the artifact.
- **Read once per head, when checks finish.** Only when checks run in CI and the story is in review. When the PR's checks
  finish (passing or failing) and every workflow run of the PR's head has completed, Featra lists the head's runs
  (`gh run list --commit <sha>`), downloads the artifact of each (`gh run download <id> -p <artifact> -D <temp>`), reads
  the matching XML up to 32 MB in total, and removes the temp folder. A head is read once. Checks running again on it
  (a re-run) mean it is read again once they finish. A failed download is tried again at the next poll.
- **Only the branch's tip counts.** As for Verified (ADR 0032), a PR head that isn't the story branch's tip is never
  read.
- **The same rule as a local run.** A linked test is looked up among the report's tests of its own file (the classname
  equals the linked file, or one path ends with the other), then by exact full name (`describe > test`). A substring, a
  skipped test or no match proves nothing. A link without a name needs every test of that file to have passed. Whatever
  the report holds counts, end-to-end tests included.
- **Several reports are one.** A test passed only when it passed in at least one report and failed in none. A test
  skipped everywhere is missing.
- **Evidence through the shared writer.** Each linked criterion gets `proven:<n>` or `unproven:<n>` by `system` through
  the same path as every check (ADR 0004), and only when it changes. Criteria that link no test are left alone. A new
  head's report decides again: a criterion Proven on an older head whose test now fails or is missing becomes unproven.
- **The card says why.** A criterion not proven shows "Test failed" or "Not in the report". The PR section lists the
  reason for each, and a note when there was no report to read. This is kept in memory with the PR's state, not written
  to the card.

## Consequences

- A project gets Proven from CI with one setting and a report upload in its workflow; Featra's own CI uploads
  `test-report-unit`.
- Proven from an older head stays until the new head's report is read, while Verified is removed as soon as the head
  moves (ADR 0032).
- Playwright's JUnit names join describe and test with `›`, not `>`, so an end-to-end test proves its criterion only
  when the reporter is set to the same separator or the link uses the name as written in the report.
- Each head costs one `gh run list` and one download per run, once.
