---
id: FEAT-19
type: feature
title: Installers
status: approved
parent: EPIC-4
order: 19
origin: planned
created: 2026-11-18T12:00:00Z
history:
  - at: 2026-11-18T12:00:00Z
    field: status
    from: null
    to: draft
    by: dev-lead
  - at: 2026-11-18T18:14:33Z
    field: status
    from: draft
    to: approved
    by: user
---

## Description

Testers install Featra on Windows, macOS or Linux from a downloaded installer, without Node, pnpm or a checkout. Installers are unsigned for now and published to GitHub Releases (decisions.md, 2026-11-17). Signed installers stay on the "Before public release" list.

Built in this order: macOS joins CI first, because Featra has never run there (STORY-63). Then the installers for each platform (STORY-64), then a release workflow that publishes them (STORY-65).

## Notes

Out of scope: signing and notarization, auto-update and a "Check for updates" item (roadmap, "Before public release"), more installer formats (roadmap).

## Decisions

Made by the user on 2026-11-18 (decisions.md; ADR 0040).

- **Epic:** EPIC-4 Distribution.
- **Packager:** electron-builder, packaging the existing Vite output from a staged app folder.
- **Formats:** Windows x64 NSIS per-user installer, macOS universal DMG plus zip, Linux x64 AppImage. deb, rpm and arm64 go on the roadmap.
- **Versions:** SemVer from 0.1.0, one version in apps/desktop/package.json. 0.x releases are pre-releases.
- **Release:** pushing a `vX.Y.Z` tag that matches the version publishes the release once every platform's smoke test passes. A manual run is a dry run that publishes nothing.
- **CI:** package jobs run on every PR and upload their installers, but aren't required at first. "E2E (macOS)" becomes a required check, which the user sets in branch protection.
- **macOS first launch:** the docs say System Settings, Privacy & Security, then Open Anyway. The app is ad-hoc signed so Apple silicon runs it.
- **PATH:** the packaged app reads the login shell's PATH at startup, so it finds `git`, `gh` and `claude`.

## Depends on

- FEAT-18 Tests run on CI
