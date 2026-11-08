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

When an e2e job fails, its Playwright output (traces, screenshots) is uploaded as an artifact named
`e2e-windows-traces` or `e2e-ubuntu-traces`. Download it from the run's summary page, then open a trace with
`pnpm --filter @featra/desktop exec playwright show-trace <path>/trace.zip`.

## Soak runs

`.github/workflows/soak.yml` repeats a spec to catch intermittent failures. It stops at the first failure and keeps
that run's trace as the `soak-<platform>-traces` artifact. There are two ways to start one.

**Push a soak branch.** Works from any commit, before the workflow reaches main. Name the branch
`soak/<platform>/<specs>/<runs>`:

```bash
git push origin HEAD:refs/heads/soak/windows/tray/150
```

- `<platform>`: `windows` or `ubuntu`.
- `<specs>`: spec names without `.spec.ts`, joined by `+` (`tray+menu`), or `all` for the whole suite.
- `<runs>`: how many times each test runs (Playwright's `--repeat-each`).

Delete the branch when the run is done. Push again (or re-run the workflow) to repeat it.

**From the Actions tab or gh.** Needs `soak.yml` on main, because GitHub only offers manual runs for workflows on the
default branch.

```bash
gh workflow run soak.yml -R MPiland/featra --ref <branch> -f spec=tray.spec.ts -f platform=windows -f runs=150
```

- `spec`: one or more spec files under `apps/desktop/e2e`, separated by spaces. Leave it empty for the whole suite.
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
