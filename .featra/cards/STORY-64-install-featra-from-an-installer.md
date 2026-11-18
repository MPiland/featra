---
id: STORY-64
type: story
title: Install Featra from an installer
status: New
parent: FEAT-19
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-18T12:00:00Z
history:
  - at: 2026-11-18T12:00:00Z
    field: status
    from: null
    to: New
    by: dev-lead
---

## Description

As a tester, I install Featra from an installer for my platform and it opens and works, without Node, pnpm or a checkout of the repo.

## Acceptance criteria

- [ ] `pnpm package` builds the installer for the platform it runs on: a Windows x64 NSIS installer, a universal macOS DMG and zip, or a Linux x64 AppImage, each named with the app's version and architecture
- [ ] A package job per platform on CI builds that installer, installs it the way a tester would, launches the installed app and passes a smoke test: the window opens, the local server starts and a project opens
- [ ] The macOS app holds both arm64 and x64 code and is ad-hoc signed, so it runs on Apple silicon and Intel Macs
- [ ] In the installed app, a chat starts with a `claude` found on the PATH, and the Featra MCP is given to the agent, as from source
- [ ] Opened from Finder, the Dock or a Linux desktop menu, the app finds `git`, `gh` and `claude` on the login shell's PATH
- [ ] The installed app is named Featra and shows the Featra icon in the taskbar, Dock and installer on each platform
- [ ] Each package job uploads its installer as a CI artifact, so a tester can try any PR's build

## Tasks

- [ ] Packaging: electron-builder (ADR 0040) with a staged app folder: the Vite `dist/` output, the client, assets and the Agent SDK outside the archive so it can spawn its files
- [ ] Desktop: the login shell's PATH read at startup on macOS and Linux, with a unit-tested fallback when the shell doesn't answer
- [ ] CI: `package-windows`, `package-macos` and `package-ubuntu` jobs; the smoke test launches the installed app's executable, not `electron .`
- [ ] A fake `claude` on the PATH for the smoke test's chat, as the e2e suite uses
- [ ] Unit and integration tests for each criterion; smoke journey on each platform; tests linked on the criteria
- [ ] Decisions recorded for the Dev Lead; ADR 0040 amended if the package layout differs; move to In Review

## Notes

The installers are unsigned (decisions.md, 2026-11-17); ad-hoc signing on macOS isn't a Developer ID signature and still shows Gatekeeper's warning. The AppImage runs on CI without FUSE through `APPIMAGE_EXTRACT_AND_RUN=1`.

## Depends on

- STORY-63 Featra runs and is tested on macOS
