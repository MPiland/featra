---
id: STORY-43
type: story
title: Every PR runs CI on Windows and Ubuntu
status: In Progress
parent: FEAT-18
order: 1
origin: added
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-07T19:20:00Z
history:
  - at: 2026-11-07T19:20:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-08T01:28:39.915Z
    field: status
    from: New
    to: In Progress
    by: user
---

## Description

As a builder working on my only PC, I want every test to run on GitHub Actions instead of my desktop, so that tests never fight me for focus and main only takes code that passes on Windows and Linux. The repo goes public as `MPiland/featra` (decisions.md, 2026-11-07). WSLg was only a stand-in for Linux, so Linux runs move to Xvfb with a window manager.

## Acceptance criteria

- [x] Before the first push, the full git history is checked for secrets, personal paths and email addresses. The findings and any fixes are recorded in Notes. (proof: History audit in Notes; the rewritten history was re-audited with zero hits before the first push)
- [ ] Each PR to main shows separate checks for the gate (format, lint, typecheck, unit tests), Windows e2e and Ubuntu e2e. Branch protection blocks the merge unless all three pass. (proof: main's protection requires Gate, E2E (Windows) and E2E (Ubuntu), applies to admins and needs a PR; throwaway PR #2 showed the three checks failing and `mergeStateStatus: BLOCKED`, run https://github.com/MPiland/featra/actions/runs/42440011619. A green Gate waits on BUG-5, see Notes)
- [ ] Every e2e test passes on GitHub's Windows runner, including the foreground tests (tray, window state, menu). Ubuntu runs the full suite under Xvfb with a window manager, so the BUG-1 maximize test runs instead of being skipped. If the Windows foreground tests can't pass on the runner, the user decides on a local VM before anything is weakened. (proof: https://github.com/MPiland/featra/actions/runs/42440511425 at 9b6ab17, E2E (Windows) 36 passed with tray, window state and menu among them, E2E (Ubuntu) 36 passed under Xvfb + Openbox with the BUG-1 maximize tests run; 0 skipped on either)
- [ ] A soak run can be started on demand for a chosen spec, platform and run count, and stops at the first failure while keeping its trace. (proof: pushing `soak/ubuntu/throwaway-blocked/5` ran https://github.com/MPiland/featra/actions/runs/42440537065, which stopped after the first failure (1 failed, 4 did not run) and kept the `soak-ubuntu-traces` artifact; `soak/windows/tray/5` passed, https://github.com/MPiland/featra/actions/runs/42440536860; the app's own trace (`electron-<n>.zip`) was proved by a failing local probe under Xvfb, which kept clicks and screenshots while passing tests kept nothing; `tooling/test/soak-plan.test.ts`)
- [x] The same Ubuntu Xvfb run works locally in WSL with one command, and nothing appears on the user's desktop. (proof: `pnpm test:e2e:wsl` on 2026-11-07, 36 passed, 0 skipped, with the BUG-1 maximize test among them; Windows was polled every 2 s during the run and showed no WSLg window; `tooling/test/e2e-wsl.test.ts`)

## Tasks

- [x] Audit the history and record the findings; create the public repo `MPiland/featra` and push main
- [x] Workflow: gate job, Windows e2e job, Ubuntu e2e job (Xvfb plus a window manager); upload Playwright traces on failure
- [x] Branch protection on main requiring the three checks
- [x] On-demand soak workflow (`workflow_dispatch`: spec, platform, runs; or push `soak/<platform>/<specs>/<runs>`)
- [x] Local WSL script for the Xvfb run; document both in the testing docs
- [x] Prove each AC with a PR whose checks are visible, plus one deliberately failing branch that is blocked

## Notes

- Blocks BUG-4, whose soak runs (150 Windows tray runs, 20 full Linux runs) move to CI and whose WSLg criterion becomes Linux under Xvfb.
- Pushing: the Dev Lead may push branches to this repo only, never force and never directly to main.

### History audit (2026-11-07, before any push)

Scope: every blob and commit message reachable from the 12 local branches (140 commits, 1,684 objects; no tags, no
stashes). Each text blob was matched for token formats (GitHub, Anthropic, OpenAI, AWS, Slack, Google, JWT, private
keys), key/secret/token/password assignments, `.env`/key/credential file names, Windows and WSL absolute paths, the
Windows user name, and email addresses.

- **Secrets: none.** The only hit is the fake `test-token-0123456789` in `packages/server/test/ws-*.test.ts`. No
  `.env`, key or credential file was ever committed. The SDK spike recorded `apiKeySource: "none"`.
- **Emails: none outside metadata.** All 140 commits carried the personal email as author and committer. Trailers use
  `noreply@anthropic.com`; fixtures use `@example.invalid`.
- **Personal paths: four places, all low risk.** They show the Windows user name and where the repo lives on disk.
  Hashes below are from before the rewrite.
  - `docs/spike-claude-sdk.md` and `spikes/claude-sdk/results.json` (since `5f0f103`, still on every branch):
    `C:\Users\<user>\.local\bin\claude.exe` and `C:\Users\<user>\AppData\Local\Temp\featra-spike-*`.
  - `.impeccable/hook.cache.json` (added `280ca04`, removed `85c8507`, history only): five
    `.claude\worktrees\story-18-...` file paths and a tool session id.
  - `docs/mockups/app.html`: sample text `.featra\worktrees\pbi-4`.
  - `apps/desktop/test/e2e-harness.test.ts` (`c0c7c5a`, BUG-4 branch): `D:\dev\example\apps\desktop` and
    `/mnt/d/src/...` as test inputs.
  - Not personal: `/mnt/c/Windows/System32/...` in the e2e harness, `/home/me/...` in client test fixtures.
- **Fix: history rewritten before the first push (the user's decision, "Rewrite, then push").**
  - `git filter-repo` in a separate `--no-local` clone, all branches. Personal paths became `<user>` or
    repo-relative paths, the session id became `<session>`. Masked test-input paths keep their length, so oxfmt's
    wrapping is unchanged.
  - Every commit's author and committer is now `Mark Piland <22205085+MPiland@users.noreply.github.com>`. New
    commits use that address.
  - Verified before pushing: the audit re-run found zero hits, each branch's tree differs from the original only in
    masked lines, and `pnpm check` passes on main.
  - Pushed: main `b4ae45b`, `feature/18-tests-run-on-ci` `daaa751`, this branch `eb43b11`,
    `claude/bug-4-wslg-flakes-592641` `e67f31f`. Local branches move onto the rewritten history (Dev Lead).

### Build notes

- CI is `.github/workflows/ci.yml` (Gate, E2E (Windows), E2E (Ubuntu)) and `.github/workflows/soak.yml`. Setup is
  shared through `.github/actions/setup`. `packageManager` pins pnpm 11.17.0 for CI and WSL.
- `tooling/e2e/xvfb.sh` won't start unless Openbox manages `_NET_ACTIVE_WINDOW`, `_NET_WM_STATE_MAXIMIZED_VERT` and
  `_NET_WM_STATE_HIDDEN`. Without that, the maximize, minimize and focus tests would skip or fall back.
- WSL quirks found on the first local run:
  - WSLg mounts `/tmp/.X11-unix` read-only, so Xvfb listens on the abstract socket only.
  - Left to choose its own number, Xvfb took `:0`, WSLg's display, where it could catch the user's WSLg apps. It now
    starts at `:99`.
  - The distro has no openbox and no passwordless sudo, so the script unpacks Ubuntu's openbox packages into
    `~/.cache` without root.
- Local runs copy the tree to `~/featra-e2e/<checkout>`, leaving the BUG-4 session's `~/featra` clone alone.
- Soak branches: GitHub only dispatches workflows that are on the default branch, so `soak.yml` also runs on a push
  to `soak/<platform>/<specs>/<runs>` (Dev Lead's call). `tooling/ci/soak-plan.ts` reads and validates both forms.
- Traces: Playwright's `trace` option records browser contexts only, so a failing Electron test kept a trace with no
  app actions in it. `launch()` in `apps/desktop/e2e/app.ts` now traces the app's context and saves
  `electron-<n>.zip` on close; `preserveOutput: "failures-only"` drops a passing test's output.
- Found by CI: `copyName` used `path.basename`, which doesn't split on `\` on Linux (fixed, 54b14ed).
- BUG-5 on CI: `packages/server/test/ws-work.test.ts` failed Gate with "No matching frame in 1000 ms" on every PR #1
  run so far: https://github.com/MPiland/featra/actions/runs/42439610499, https://github.com/MPiland/featra/actions/runs/42440180196, https://github.com/MPiland/featra/actions/runs/42440511425 (and PR #2's https://github.com/MPiland/featra/actions/runs/42440011619).
  The Gate is not re-run to green; BUG-5 is with the user.
- PR #2 (`throwaway/story-43-blocked`) was closed and its branch deleted; the soak branches were deleted after
  their runs.
- Merge point with BUG-4: the trace fix adds `traceUntilClosed()` to `launch()` in `apps/desktop/e2e/app.ts` (and
  imports `test` there), which BUG-4's branch also changes. Whichever lands second keeps the `traceUntilClosed(app)`
  call right after `electron.launch()` and before `firstWindow()`.
