# 0031 — Checks run on this computer, or in CI

Date: 2026-11-12 · Status: proposed

## Context

Evidence is Reported, Verified, Proven, Accepted (ADR 0004). Until STORY-56 nothing wrote Verified or Proven. A project
can prove its work in CI (STORY-11 reads it through GitHub) or on the user's own computer. The second needs no GitHub, no
tokens and no waiting, so Featra can run it itself.

## Decision

- **A project setting chooses where checks run**: `checksWhere: ci | local` in `.featra/config.yaml`, shared through git.
  With no value it defaults to CI when the repo has a GitHub remote, workflow files and `gh` says it is public; otherwise
  this computer. An unknown answer (no `gh`, signed out, failing) counts as not public and says so: "Couldn't tell if it's public on GitHub, so checks run on this computer." The reason for the default is shown.
  GitHub detection is one module (`github-detect.ts`) with a fixed `gh` argv, for STORY-11 to reuse.
- **Two commands, confirmed by the user.** `checkCommand` runs once per story; `linkedTestCommand` is a template run once
  per test file that acceptance criteria link (`{file}`, `{namePattern}` for all the file's linked names, `{name}` for a
  file with one, and `{report}`). Featra proposes them from the project's files (the `test` script of `package.json`, the
  lockfile's package manager, vitest) and the Dev Lead proposes them with `propose_check_command`. The vitest proposal is
  `pnpm exec vitest run {file} -t {namePattern} --reporter=junit --outputFile={report}`. Jest is not proposed: it can't
  write a report to a chosen path. A proposal is only shown in Project settings; nothing is applied until the user saves
  it. Proposals are kept in the app's data folder, never in the committed config.
- **Git can change the config, so a command must be confirmed here.** The app's data folder keeps the last confirmed
  `checkCommand` and `linkedTestCommand`. A different value in `config.yaml` shows "Changed in the project's config" with
  Confirm, and that command does not run until confirmed. Saving a value in Project settings confirms it.
- **The server runs them, on this computer only.** A run costs no tokens and never blocks the UI (a child process). The
  confirmed command goes through the platform shell as typed. Test refs are quoted per platform and passed as separate
  arguments; card text is never interpolated into a shell, and a ref that cannot be quoted safely is refused.
- **When.** A story in the review stage (found by position, as for acceptance) or in Acceptance is checked when it moves
  into review, when its worktree's HEAD changes, and on Re-run. At startup the HEAD is recorded and nothing runs.
- **One run per worktree, queued not cancelled.** A request during a run sets one pending flag; the stale result is
  discarded and the run starts again. At most two runs go at once across the app. Output is kept as a bounded tail.
- **Results go to the card's owner copy by `system`.** A pass writes Verified; a fail removes it. Verified is only written
  on a change, so history stays short. Linked tests run after the check command whatever its result, one run per file.
- **A JUnit report is the only proof (ADR 0004).** `{report}` is a temp path Featra fills; the shared parser is in
  work-format (STORY-57 reuses it). A criterion is Proven only if the report has a test whose full name equals the linked
  name, with no failure, error or skip, for every ref it links. A name that matches nothing, or is only part of another
  test's name, proves nothing, whatever the exit code. A template without `{report}` gives "Can't prove linked tests
  without a report" and proves nothing. A missing file or a test missing from the report fails the criterion. A ref no
  command covers (a path under `e2e`, `playwright` or `cypress`) gets "No command runs this test" and its criterion is
  left as it was, never "Test failed". When Verified arrives on an accepted story, `settleDone` moves it to Done.
- **Provider-neutral.** Nothing here names an agent provider. The Dev Lead's tool is one more MCP tool on the agent side.

## Consequences

- A story can make itself Verified by editing its own test script or its tests, because the commands run in its
  worktree. CI has the same property; the user's Accept is where it is judged.
- Playwright and other end-to-end refs are not run: no template covers them yet (a roadmap item).
- The server watches every allowed project's worktrees for HEAD changes: a few more file watchers.
- Windows quoting refuses `"`, `%`, `^`, `!` and line breaks in a test name rather than guess at `cmd`.
