# 0031 — Checks run on this computer, or in CI

Date: 2026-11-12 · Status: proposed

## Context

Evidence is Reported, Verified, Proven, Accepted (ADR 0004). Until STORY-56 nothing wrote Verified or Proven. A project
can prove its work in CI (STORY-11 reads it through GitHub) or on the user's own computer. The second needs no GitHub, no
tokens and no waiting, so Featra can run it itself.

## Decision

- **A project setting chooses where checks run**: `checksWhere: ci | local` in `.featra/config.yaml`, shared through git.
  With no value it defaults to CI when the repo has a GitHub remote, workflow files and `gh` says it is public; otherwise
  this computer. An unknown answer (no `gh`, signed out, failing) counts as not public. The reason for the default is shown.
  GitHub detection is one module (`github-detect.ts`) with a fixed `gh` argv, for STORY-11 to reuse.
- **Two commands, confirmed by the user.** `checkCommand` runs once per story; `linkedTestCommand` is a template run for
  each acceptance criterion's linked test (`{file}`, `{name}`, `{namePattern}`). Featra proposes them from the project's
  files (the `test` script of `package.json`, the lockfile's package manager, a known test runner) and the Dev Lead
  proposes them with `propose_check_command`. A proposal is only shown in Project settings; nothing is applied until the
  user saves it. Proposals are kept in the app's data folder, never in the committed config.
- **The server runs them, on this computer only.** A run costs no tokens and never blocks the UI (a child process). The
  confirmed command goes through the platform shell as typed. Test refs are quoted per platform and passed as separate
  arguments; card text is never interpolated into a shell, and a ref that cannot be quoted safely is refused.
- **When.** A story in the review stage (found by position, as for acceptance) or in Acceptance is checked when it moves
  into review, when its worktree's HEAD changes, and on Re-run. At startup the HEAD is recorded and nothing runs.
- **One run per worktree, queued not cancelled.** A request during a run sets one pending flag; the stale result is
  discarded and the run starts again. At most two runs go at once across the app. Output is kept as a bounded tail.
- **Results go to the card's owner copy by `system`.** A pass writes Verified; a fail removes it. Verified is only written
  on a change, so history stays short. Each linked test is run after the check command whatever its result; an
  acceptance criterion is Proven only if all its runnable refs pass, and a missing file counts as a failure. A criterion
  with no runnable ref is left alone. When Verified arrives on an accepted story, `settleDone` moves it to Done.
- **Provider-neutral.** Nothing here names an agent provider. The Dev Lead's tool is one more MCP tool on the agent side.

## Consequences

- A vitest `-t` filter that matches nothing exits 0, so such a linked test passes; Playwright refs cannot be run by a
  vitest template. Both are limits of the template, shown in settings help, not silently worked around.
- The server watches every allowed project's worktrees for HEAD changes: a few more file watchers.
- Windows quoting refuses `"`, `%`, `^`, `!` and line breaks in a test name rather than guess at `cmd`.
