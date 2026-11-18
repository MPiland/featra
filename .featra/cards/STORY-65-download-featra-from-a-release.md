---
id: STORY-65
type: story
title: Download Featra from a release
status: New
parent: FEAT-19
order: 3
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

As a tester, I download Featra for my platform from the project's Releases page, get past the unsigned-app warning by following the install guide, and can tell which version I run.

## Acceptance criteria

- [ ] Pushing a `vX.Y.Z` tag builds all three installers, smoke-tests each on its platform and publishes them to a release for that tag; 0.x releases are marked as pre-releases
- [ ] A tag that doesn't match the app's version fails before anything is built, with a message naming both versions
- [ ] A release isn't published unless every platform's installer passed its smoke test
- [ ] The release lists the changes since the last release and has a SHA-256 checksum for each installer
- [ ] A manual run of the release workflow builds and smoke-tests the installers without publishing anything
- [ ] The app shows its version under Settings, the same version as the release it came from
- [ ] README has an Install section, and docs/install.md walks through the first launch on each platform: SmartScreen's "Run anyway" on Windows, Privacy & Security's "Open Anyway" on macOS, and making the AppImage executable on Linux, plus the tools Featra needs (`git`, `gh`, `claude`)

## Tasks

- [ ] Rules: the tag and version check, as a tested script in `tooling/release/`
- [ ] CI: `release.yml` on tag push and manual run, reusing the package jobs from STORY-64; publishing in a last job that needs every smoke test
- [ ] Release notes from merged PRs, with a short "Unsigned build" note linking docs/install.md; checksums attached
- [ ] Client: the version under Settings, from the app
- [ ] Docs: README Install section, docs/install.md, how to cut a release (bump, PR, tag)
- [ ] Unit and integration tests for each criterion; a dry run of the workflow and one published pre-release as its proof; tests linked on the criteria
- [ ] Decisions recorded for the Dev Lead; move to In Review

## Notes

The first real release (v0.1.0) is cut by the user once this story is Done: tagging publishes, so it is their call. The story's proof includes a pre-release from a test tag. Publishing it is public, so the story agent asks for the user's OK before pushing that tag; it can be deleted after if the user wants.

## Depends on

- STORY-64 Install Featra from an installer
