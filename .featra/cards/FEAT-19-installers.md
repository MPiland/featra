---
id: FEAT-19
type: feature
title: Installers
status: draft
parent: null
order: 19
origin: planned
created: 2026-11-18T12:00:00Z
history:
  - at: 2026-11-18T12:00:00Z
    field: status
    from: null
    to: draft
    by: dev-lead
---

## Description

Testers install Featra on Windows, macOS or Linux from a downloaded installer, without Node, pnpm or a checkout. Installers are unsigned for now and published to GitHub Releases (decisions.md, 2026-11-17). Signed installers stay on the "Before public release" list.

Built in this order: macOS joins CI first, because Featra has never run there (STORY-63). Then the installers for each platform (STORY-64), then a release workflow that publishes them (STORY-65).

## Open questions

Recommended answers, for the user to confirm before the feature is approved.

1. **Epic.** No epic fits: EPIC-2 is automation and review, EPIC-3 is everyday ADE tools. Recommended: leave the feature under no epic (it shows on its own in Work), or add a "Distribution" epic if more release work follows. Filing it under EPIC-2 because it's built next is the fallback.
2. **Packager.** Recommended: electron-builder. One config gives an NSIS installer, a universal macOS DMG and an AppImage, and it packages our existing Vite output as it is. Electron Forge replaces the build with its own plugins and has no first-party AppImage maker. Risk: pnpm workspaces; only the Agent SDK is left unbundled, so a staged app folder with just that dependency keeps it small.
3. **Formats.** Recommended: Windows x64 NSIS per-user installer (no admin prompt); macOS universal DMG plus a zip; Linux x64 AppImage. deb, rpm and arm64 Windows or Linux go to the roadmap.
4. **Version scheme.** Recommended: SemVer from 0.1.0, one version in apps/desktop/package.json, bumped in the PR that prepares a release. 0.x releases are marked as pre-releases.
5. **Release trigger.** Recommended: pushing a `vX.Y.Z` tag that matches the package version. A tag names exactly what was built, and a mismatch fails before anything is built. A manual run builds the installers without publishing, as a dry run.
6. **Publishing.** Recommended: the workflow publishes the release itself once every platform's installer passed its smoke test. The tag is the go-ahead, so there is no second manual step.
7. **macOS on CI.** Recommended: "E2E (macOS)" becomes a required check on main, like Windows and Ubuntu. Branch protection is a repository setting, so the user changes it (the story says which check name to add).
8. **Installer builds on PRs.** Recommended: the three package jobs run on every PR and push to main and upload their installers, but are not required checks until they have been stable for a while.
9. **macOS first launch.** decisions.md says "right-click then Open". Since macOS 15 that no longer opens an unsigned app; the user goes to System Settings, Privacy & Security, Open Anyway. Recommended: the docs describe that. The app must still be ad-hoc signed, or Apple silicon won't run it at all.
10. **Tools on the PATH.** An app opened from Finder or a Linux desktop menu doesn't get the shell's PATH, so `git`, `gh` and `claude` installed through Homebrew or npm aren't found. Recommended: the packaged app reads the login shell's PATH at startup (STORY-64), as other desktop dev tools do.

## Notes

Out of scope: signing and notarization, auto-update and a "Check for updates" item (roadmap, "Before public release"), more installer formats (roadmap).

## Depends on

- FEAT-18 Tests run on CI
