---
id: STORY-64
type: story
title: Install Featra from an installer
status: Done
parent: FEAT-19
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-64-installers
pr: https://github.com/MPiland/featra/pull/74
created: 2026-11-18T12:00:00Z
history:
  - at: 2026-11-18T12:00:00Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-18T23:16:18Z
    field: status
    from: New
    to: In Progress
    by: dev
  - at: 2026-11-19T00:35:37Z
    field: status
    from: In Progress
    to: In Review
    by: dev
  - at: 2026-11-19T02:32:10Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-19T02:32:10Z
    field: status
    from: In Review
    to: Done
    by: user
---

## Description

As a tester, I install Featra from an installer for my platform and it opens and works, without Node, pnpm or a checkout of the repo.

## Acceptance criteria

- [x] `pnpm package` builds the installer for the platform it runs on: a Windows x64 NSIS installer, a universal macOS DMG and zip, or a Linux x64 AppImage, each named with the app's version and architecture (test: apps/desktop/test/packaging.test.ts::the installers pnpm package builds (STORY-64) > are named with the app's version and architecture, on each platform, apps/desktop/test/packaging.test.ts::the installers pnpm package builds (STORY-64) > are a Windows x64 NSIS per-user installer, a universal macOS DMG and zip, and a Linux x64 AppImage, apps/desktop/e2e/installed/installed.smoke.ts::pnpm package built the installer, named with the version and architecture, and it installs Featra)
- [x] A package job per platform on CI builds that installer, installs it the way a tester would, launches the installed app and passes a smoke test: the window opens, the local server starts and a project opens (test: apps/desktop/test/package-ci.test.ts::CI's package jobs (STORY-64) > run on each platform: build the installer, then install it and launch the installed app, apps/desktop/test/client-path.test.ts::the client the window loads (STORY-64) > is the app folder's own copy when installed, apps/desktop/e2e/installed/installed.smoke.ts::pnpm package built the installer, named with the version and architecture, and it installs Featra, apps/desktop/e2e/installed/installed.smoke.ts::the installed app opens a project, starts its local server, and chats with claude and the Featra MCP)
- [x] The macOS app holds both arm64 and x64 code and is ad-hoc signed, so it runs on Apple silicon and Intel Macs (test: apps/desktop/test/packaging.test.ts::the installers pnpm package builds (STORY-64) > ad-hoc signs the macOS app, with no Developer ID and no notarization, apps/desktop/e2e/installed/installed.smoke.ts::the macOS app holds both Apple silicon and Intel code, runs as each, and is ad-hoc signed)
- [x] In the installed app, a chat starts with a `claude` found on the PATH, and the Featra MCP is given to the agent, as from source (test: apps/desktop/test/packaging.test.ts::the staged app folder (STORY-64) > carries the Agent SDK the app imports, at the locked version, and what it needs, but not Claude Code's binaries, apps/desktop/test/staged-modules.test.ts::the staged node_modules (STORY-64) > drives the user's claude with the staged Agent SDK, which looks for none of its own, apps/desktop/e2e/installed/installed.smoke.ts::the installed app opens a project, starts its local server, and chats with claude and the Featra MCP)
- [x] Opened from Finder, the Dock or a Linux desktop menu, the app finds `git`, `gh` and `claude` on the login shell's PATH (test: apps/desktop/test/login-path.test.ts::the login shell's PATH (STORY-64) > runs the shell as an interactive login shell and puts its PATH first, keeping the rest of the started one, apps/desktop/test/login-path.test.ts::the login shell's PATH (STORY-64) > reads the PATH between its marks when the shell's rc files print lines of their own, apps/desktop/test/login-path.test.ts::the login shell's PATH (STORY-64) > falls back to the started PATH and the usual folders when the shell fails or doesn't answer in time, apps/desktop/test/login-path.test.ts::the login shell's PATH (STORY-64) > falls back when a real shell never answers, after the time limit, apps/desktop/test/login-path.test.ts::the login shell's PATH (STORY-64) > reads the PATH a real login shell's profile sets, apps/desktop/test/login-path.test.ts::the login shell's PATH (STORY-64) > passes the command the same way to every shell, and csh and tcsh no -i or -l, which they take only alone, apps/desktop/test/login-path-shell.test.ts::the login shell's PATH from each shell (STORY-64) > reads it from bash, apps/desktop/test/login-path-shell.test.ts::the login shell's PATH from each shell (STORY-64) > reads it from zsh, apps/desktop/test/login-path-shell.test.ts::the login shell's PATH from each shell (STORY-64) > reads it from fish, apps/desktop/test/login-path-shell.test.ts::the login shell's PATH from each shell (STORY-64) > reads it from tcsh, apps/desktop/test/login-path-shell.test.ts::the login shell's PATH from a misbehaving profile (STORY-64) > falls back at the time limit when the profile never finishes, though the shell ignores SIGTERM, apps/desktop/test/login-path-shell.test.ts::the login shell's PATH from a misbehaving profile (STORY-64) > reads the PATH without waiting for a background job the profile leaves running, apps/desktop/test/server-start-after.test.ts::the server started after the PATH is read (STORY-64) > doesn't start until it is told to, then starts with what main set meanwhile, apps/desktop/e2e/installed/installed.smoke.ts::opened from Finder, the Dock or a desktop menu, it finds claude on the login shell's PATH)
- [x] The installed app is named Featra and shows the Featra icon in the taskbar, Dock and installer on each platform (test: apps/desktop/test/packaging.test.ts::the installers pnpm package builds (STORY-64) > names the app Featra and gives it, its installers and its shortcuts the Featra icon, apps/desktop/test/packaging.test.ts::the staged app folder (STORY-64) > holds dist, the client where the installed app loads it, the assets, and a package.json named Featra, apps/desktop/e2e/installed/installed.smoke.ts::the installed app is named Featra, keeps its data in the Featra folder, and carries the Featra icon)
- [x] Each package job uploads its installer as a CI artifact, so a tester can try any PR's build (test: apps/desktop/test/package-ci.test.ts::CI's package jobs (STORY-64) > upload each platform's installer, the smoke test's report, and a failed run's traces, apps/desktop/test/package-ci.test.ts::CI's package jobs (STORY-64) > are not among main's required checks, as the workflow and docs/testing.md list them)

## Tasks

- [x] Packaging: electron-builder (ADR 0040) with a staged app folder: the Vite `dist/` output, the client, assets and the Agent SDK outside the archive so it can spawn its files
- [x] Desktop: the login shell's PATH read at startup on macOS and Linux, with a unit-tested fallback when the shell doesn't answer
- [x] CI: `package-windows`, `package-macos` and `package-ubuntu` jobs; the smoke test launches the installed app's executable, not `electron .`
- [x] A fake `claude` on the PATH for the smoke test's chat, as the e2e suite uses
- [x] Unit and integration tests for each criterion; smoke journey on each platform; tests linked on the criteria
- [x] Decisions recorded for the Dev Lead; ADR 0040 amended if the package layout differs; move to In Review

## Notes

The installers are unsigned (decisions.md, 2026-11-17); ad-hoc signing on macOS isn't a Developer ID signature and still shows Gatekeeper's warning. The AppImage runs on CI without FUSE through `APPIMAGE_EXTRACT_AND_RUN=1`.

## Depends on

- STORY-63 Featra runs and is tested on macOS
