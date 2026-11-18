# 0040 — Installers with electron-builder, released when a version tag is pushed

Date: 2026-11-18 · Status: proposed

## Context

Featra runs only from source (`pnpm start`). Testers need installers for Windows, macOS and Linux, unsigned for now and
published to GitHub Releases (decisions.md, 2026-11-17). The app is already built by Vite into self-contained CommonJS
files in `apps/desktop/dist/` (main, preload, server, MCP). The one dependency left unbundled is the Agent SDK, which
spawns its own files (ADR 0018). The packager has to work with that build and a pnpm workspace. It must also make an
NSIS installer, a universal macOS app and an AppImage.

The options were:

- **electron-builder:** one config for NSIS, DMG and zip, AppImage, and universal macOS builds. It packages a
  prebuilt app folder.
- **Electron Forge:** builds through its own Vite or webpack plugins, so the build would change. It prefers
  Squirrel.Windows and has no first-party AppImage maker.

## Decision

- **electron-builder packages the existing build.** A staged app folder holds `dist/`, the client, the assets and a
  `package.json` whose only dependency is the Agent SDK. The SDK is left outside the asar archive so it can spawn its
  files. The workspace's own build doesn't change.
- **Formats:** Windows x64 NSIS per-user installer (no admin prompt), macOS universal DMG plus zip, ad-hoc signed so
  Apple silicon runs it, and Linux x64 AppImage. Nothing is signed with a developer identity yet.
- **Versions:** SemVer from 0.1.0, with one version in `apps/desktop/package.json`. 0.x releases are pre-releases.
- **Release trigger:** pushing a `vX.Y.Z` tag. The tag must match the version, or the workflow fails before it builds
  anything. Each platform's installer is built, installed and smoke-tested on its own runner. A last job publishes the
  release, with checksums and notes from merged PRs, only when every smoke test passed. The tag is the go-ahead, so
  there is no second manual step. A manual run is a dry run that builds and tests but publishes nothing.
- **PR builds:** CI builds and uploads each platform's installer on every PR. These jobs aren't required checks at
  first.

## Consequences

- One packaging config, kept beside the desktop app. Signing later adds identities to it rather than a new tool.
- Packaging breakage shows on every PR, but doesn't block a merge until the jobs are required.
- Only the user pushes release tags, because a tag publishes.
- Unsigned installers warn on first launch: SmartScreen on Windows, and Gatekeeper on macOS, where the user opens the
  app through Privacy & Security, then Open Anyway. The install guide covers both.
- Auto-update isn't possible yet. Squirrel.Mac needs a signed app, and it is on the roadmap with signing.
