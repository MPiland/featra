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

## Amendment (STORY-64, 2026-11-18)

Building it changed the package layout:

- **No asar archive at all.** The server and the MCP run as their own processes from `dist/`, and the Agent SDK is
  imported from `node_modules`. All would have to be unpacked, leaving only the client in the archive.
- **The staged `package.json` declares no dependencies.** `pnpm package` copies the Agent SDK, and what it needs at run
  time, from the workspace's installed packages into the staged `node_modules`, at the lockfile's versions and without
  a network install. Its optional dependencies are left out: they are Claude Code's own binaries, one per platform,
  and Featra runs the user's `claude`.
- **The client is staged at `client/`**, and the installed app loads it from there.
- **The installed app keeps its data in a `Featra` folder** (the staged package is named for the product). A source
  run keeps `@featra/desktop`, so both can run side by side.
- **The installed app reads the login shell's PATH on macOS and Linux**, since Finder, the Dock and a desktop menu
  don't give it the terminal's. If the shell fails or takes over 5 seconds, it adds the usual folders instead.

## Amendment (STORY-65, 2026-11-18)

Building the release workflow settled its shape:

- **One set of package jobs.** The three package jobs live in a reusable workflow, `package.yml`, called by CI and by
  `release.yml`. A release builds and smoke-tests exactly what every PR does. Their checks show as
  "Installers / Package (Windows)".
- **Four jobs in order: Plan, Installers, Notes and checksums, Publish.** Plan checks the tag against the version
  before anything is built. Publish needs every earlier job, runs only for a pushed tag, and is the only job with
  write access to the repo.
- **Publishing is all or nothing.** Publish checks the tag on GitHub still names the commit the run built, creates the
  release as a draft with every file, then publishes it. A re-run finishes a draft a failed run left; a published
  release is never changed.
- **Tags are `v` and the SemVer version, pre-release parts allowed** (`v0.2.0-rc.1`), so a release candidate can be
  tested without using up a version. 0.x versions and versions with a pre-release part publish as pre-releases; from
  1.0.0 a release is marked latest.
- **Notes come from git, not the GitHub API.** The notes job lists the merge commits since the previous release tag
  merged into the commit, one line per pull request, so a dry run writes the same notes as a release. For a full
  release (no pre-release part) the previous release is the last full one, skipping release candidates (the user's
  call); for a pre-release it is the last tag of any kind. The notes say the build is
  unsigned and link the install guide at the tag.
- **Checksums** are SHA-256, listed in the notes and attached as `SHA256SUMS.txt` in `sha256sum` format.
- **Dry runs:** any run that isn't a pushed tag publishes nothing. Besides a manual run, a pull request that changes
  the release workflow or `tooling/release/` dry-runs it, since GitHub only offers manual runs for workflows on the
  default branch.
- **The app shows its version under Settings**, from `app.getVersion()`, the version the installer and the release
  are named with.

## Consequences

- One packaging config, kept beside the desktop app. Signing later adds identities to it rather than a new tool.
- Packaging breakage shows on every PR, but doesn't block a merge until the jobs are required.
- Only the user pushes release tags, because a tag publishes.
- Unsigned installers warn on first launch: SmartScreen on Windows, and Gatekeeper on macOS, where the user opens the
  app through Privacy & Security, then Open Anyway. The install guide covers both.
- Auto-update isn't possible yet. Squirrel.Mac needs a signed app, and it is on the roadmap with signing.
