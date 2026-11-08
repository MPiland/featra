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

- [ ] Before the first push, the full git history is checked for secrets, personal paths and email addresses. The findings and any fixes are recorded in Notes.
- [ ] Each PR to main shows separate checks for the gate (format, lint, typecheck, unit tests), Windows e2e and Ubuntu e2e. Branch protection blocks the merge unless all three pass.
- [ ] Every e2e test passes on GitHub's Windows runner, including the foreground tests (tray, window state, menu). Ubuntu runs the full suite under Xvfb with a window manager, so the BUG-1 maximize test runs instead of being skipped. If the Windows foreground tests can't pass on the runner, the user decides on a local VM before anything is weakened.
- [ ] A soak run can be started on demand for a chosen spec, platform and run count, and stops at the first failure while keeping its trace.
- [ ] The same Ubuntu Xvfb run works locally in WSL with one command, and nothing appears on the user's desktop.

## Tasks

- [ ] Audit the history and record the findings; create the public repo `MPiland/featra` and push main
- [ ] Workflow: gate job, Windows e2e job, Ubuntu e2e job (Xvfb plus a window manager); upload Playwright traces on failure
- [ ] Branch protection on main requiring the three checks
- [ ] On-demand soak workflow (`workflow_dispatch`: spec, platform, runs)
- [ ] Local WSL script for the Xvfb run; document both in the testing docs
- [ ] Prove each AC with a PR whose checks are visible, plus one deliberately failing branch that is blocked

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
- **Emails: none outside metadata.** All 140 commits carry `<personal email>` as author and committer, which goes
  public with the repo. Trailers use `noreply@anthropic.com`; fixtures use `@example.invalid`.
- **Personal paths: four places, all low risk.** They show the Windows user name and where the repo lives on disk.
  - `docs/spike-claude-sdk.md` and `spikes/claude-sdk/results.json` (since `5f0f103`, still on every branch):
    `C:\Users\<user>\.local\bin\claude.exe` and `C:\Users\<user>\AppData\Local\Temp\featra-spike-*`.
  - `.impeccable/hook.cache.json` (added `280ca04`, removed `85c8507`, history only): five
    `.claude\worktrees\story-18-...` file paths and a tool session id.
  - `docs/mockups/app.html`: sample text `.featra\worktrees\pbi-4`.
  - `apps/desktop/test/e2e-harness.test.ts` (`c0c7c5a`, BUG-4 branch): `D:\dev\example\apps\desktop` and
    `/mnt/d/src/...` as test inputs.
  - Not personal: `/mnt/c/Windows/System32/...` in the e2e harness, `/home/me/...` in client test fixtures.
- **Fix: none applied.** Rewriting history is the user's call (proposal in the report to the Dev Lead).
