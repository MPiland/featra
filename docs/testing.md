# Testing

How the tests run, and where. The rules for what a test must prove are in ADR 0013 and `docs/coding-standards.md`.

## Where tests run

E2e tests launch the real Electron app and take keyboard focus and the foreground window. They don't run on the
desktop of the machine you work on (decisions.md, 2026-11-07). They run on GitHub Actions, and Linux runs can also
happen locally in WSL under Xvfb.

| Command                         | Runs                                        | Where                                 |
| ------------------------------- | ------------------------------------------- | ------------------------------------- |
| `pnpm check`                    | Format, lint, typecheck and unit tests      | Anywhere; the pre-commit hook runs it |
| `pnpm test:e2e:wsl [args]`      | The e2e suite on Linux under Xvfb + Openbox | WSL (Ubuntu), from Windows            |
| `tooling/e2e/xvfb.sh <command>` | Any command on a private Xvfb display       | Linux: CI, WSL, a Linux machine       |
| CI workflow (every PR)          | Gate, Windows e2e, Ubuntu e2e               | GitHub Actions                        |
| Soak workflow (on demand)       | One spec repeated until it fails            | GitHub Actions                        |

Don't run `pnpm test:e2e` on a Windows desktop someone is using.

## CI on every pull request

`.github/workflows/ci.yml` runs three jobs on every pull request and on each push to main:

- **Gate**: `pnpm check` on Ubuntu.
- **E2E (Windows)**: `pnpm test:e2e` on GitHub's Windows runner, including the foreground tests (tray, window state,
  menu).
- **E2E (Ubuntu)**: `pnpm test:e2e` under `tooling/e2e/xvfb.sh`, so it runs on Xvfb with Openbox as the window
  manager. Openbox maximises, minimises and tracks the active window, so no test skips for lack of a window manager.
  The script refuses to start if the window manager doesn't advertise those.

Branch protection on main requires all three checks, plus the user's Accept. The check names are the job names.
Renaming a job means updating branch protection with it.

## When a test fails

**An e2e test.** Its line in the job's log is followed by where it stopped (BUG-30):

```text
Where "opens the Work list" stopped (timedOut):
  Step: Click
  At: apps/desktop/e2e/work-list.spec.ts:42: await page.getByRole("button", { name: "Cards and the feature list" }).click();
  Still running after 57.3 s when the test ended
  Kept:
    apps/desktop/test-results/work-list-opens-the-Work-list/electron-1-window-1.png
    apps/desktop/test-results/work-list-opens-the-Work-list/electron-1.zip
```

`Step` is the action or assertion it was waiting in, or the last one that failed; `At` is that line of the spec, which
names the locator. A test that failed instead of timing out also prints the step's error.

The job uploads the failed tests' output as an artifact named `e2e-windows-traces` or `e2e-ubuntu-traces`. Download it
from the run's summary page, or with `gh run download <run id> -R MPiland/featra -n e2e-windows-traces`. Each failed
test has a folder with:

- `electron-<n>-window-<w>.png`: each window of the app's `n`th launch, as it was when the test stopped.
- `electron-<n>.zip`: that launch's trace: its actions, a DOM snapshot of each and a screencast.
- `trace.zip`: the test's own steps.

Open a trace with `pnpm --filter @featra/desktop exec playwright show-trace <file>`, or drop it on
<https://trace.playwright.dev>. Pick an action to see the DOM snapshot before and after it. Open a `.png` in any image
viewer. Passing tests keep no output.

Every spec imports `test` and `expect` from `apps/desktop/e2e/fixtures.ts`, not `@playwright/test`. Its evidence
fixture closes the apps a test left running, so a test that times out still keeps the screenshots and the trace
(`apps/desktop/e2e/evidence.ts`).

**A unit test the hang guard stopped.** Vitest reports `Test timed out in <n>ms` and, as a second error, what the test
was still waiting for, how long, and the test line that asked:

```text
The test ended while still waiting for:
- expect.poll(() => store.saved).toBe(true) (for 30 s)
    at packages/server/test/store.test.ts:57: await expect.poll(() => store.saved).toBe(true);
```

Waits are noted by `until` and `waitingFor` in `tooling/waits.ts`, `expect.poll`, the WebSocket test client's `next`,
and Testing Library's waits and user-event actions. A new kind of wait should go through `waitingFor`. The report is
added after each test, so a wait in a `beforeEach` or `beforeAll` hook that the hang guard stops gets none.

## Screens for design review

Every story that adds or changes UI gets a visual design review of its rendered screens before the user's Accept
(decisions.md, 2026-11-16). The story's e2e journey captures them: after the assertions that put a new or changed
screen in the state to review, call `uxShot(page, "<feat>-<surface>-<state>", locator)` from `apps/desktop/e2e/ux-shot.ts`.
It saves the whole window at its normal size to `apps/desktop/test-results/ux/<os>/<name>.png`, scrolling `locator`
into view first. It asserts nothing and never fails a test, so add no assertions for it and don't move existing ones.
Capture each state the story adds (off and on, before and after), and both the card pane and the Work list where the
story changes them. Names must be unique across the suite.

Each e2e job uploads that folder, pass or fail, as `ux-screens-windows` or `ux-screens-ubuntu` (kept 7 days).

## Soak runs

`.github/workflows/soak.yml` repeats an e2e spec, or the whole unit suite, to catch intermittent failures. It stops at
the first failure. An e2e soak keeps that run's trace as the `soak-<platform>-traces` artifact. A unit soak runs
`pnpm test:unit` again and again and keeps every run's output, one log per run, as `soak-unit-<platform>-output`. Unit
soaks for timed criteria run here, on the Windows runner, rather than on a busy PC (BUG-6). There are two ways to start
one.

**Push a soak branch.** Works from any commit, before the workflow reaches main. Name the branch
`soak/<platform>/<specs>/<runs>`:

```bash
git push origin HEAD:refs/heads/soak/windows/tray/150
git push origin HEAD:refs/heads/soak/windows/unit/50
```

- `<platform>`: `windows` or `ubuntu`.
- `<specs>`: spec names without `.spec.ts`, joined by `+` (`tray+menu`), `all` for the whole e2e suite, or `unit` for
  the whole unit suite.
- `<runs>`: how many times each test runs (Playwright's `--repeat-each`), or how many full unit runs in a row.

Delete the branch when the run is done. Push again (or re-run the workflow) to repeat it.

**From the Actions tab or gh.** Needs `soak.yml` on main, because GitHub only offers manual runs for workflows on the
default branch.

```bash
gh workflow run soak.yml -R MPiland/featra --ref <branch> -f spec=tray.spec.ts -f platform=windows -f runs=150
```

- `suite`: `e2e` (the default) or `unit`, as `-f suite=unit`.
- `spec`: one or more spec files under `apps/desktop/e2e`, separated by spaces. Leave it empty for the whole suite, and
  always for `unit`.
- `platform` and `runs`: as above.

`tooling/ci/soak-plan.ts` reads both forms and rejects anything else. A run is capped at six hours (GitHub's limit for
one job).

## Linux e2e locally, in WSL

```bash
pnpm test:e2e:wsl
```

```bash
pnpm test:e2e:wsl window-state.spec.ts
```

From Windows, this:

1. copies the working tree (uncommitted changes included, `.gitignore`d files and `node_modules` left out) to
   `~/featra-e2e/<checkout folder>` inside the `Ubuntu` distro;
2. runs `pnpm install` there, with Linux binaries;
3. runs the e2e suite under `tooling/e2e/xvfb.sh`, passing on any Playwright arguments.

The app draws on a private Xvfb display (`:99` or the next free one, never WSLg's `:0`), with Wayland unset, so no window appears on the Windows desktop and nothing takes
focus. Run one e2e suite at a time on the machine.

Needs, inside the distro: node and pnpm in `~/.local/node/bin`, plus `Xvfb`, `xprop` and `rsync`
(`sudo apt-get install xvfb x11-utils rsync`). Openbox is used from PATH if installed; otherwise the script unpacks
Ubuntu's own openbox packages into `~/.cache/featra-openbox` the first time (no root needed). Set
`FEATRA_WSL_DISTRO` to use another distro.

Traces from a failed run are in `\\wsl$\Ubuntu\home\<you>\featra-e2e\<checkout folder>\apps\desktop\test-results`.
