---
id: STORY-65
type: story
title: Download Featra from a release
status: Done
parent: FEAT-19
order: 3
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-65-releases
pr: https://github.com/MPiland/featra/pull/76
created: 2026-11-18T12:00:00Z
history:
  - at: 2026-11-18T12:00:00Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-19T02:50:00Z
    field: status
    from: New
    to: In Progress
    by: dev
  - at: 2026-11-19T06:30:00Z
    field: status
    from: In Progress
    to: In Review
    by: dev
  - at: 2026-11-19T17:27:00Z
    field: status
    from: In Review
    to: Acceptance
    by: dev
  - at: 2026-11-19T18:08:34Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-19T18:08:34Z
    field: status
    from: Acceptance
    to: Done
    by: user
---

## Description

As a tester, I download Featra for my platform from the project's Releases page, get past the unsigned-app warning by following the install guide, and can tell which version I run.

## Acceptance criteria

- [x] Pushing a `vX.Y.Z` tag builds all three installers, smoke-tests each on its platform and publishes them to a release for that tag; 0.x releases are marked as pre-releases (test: apps/desktop/test/release-ci.test.ts::the release workflow (STORY-65) > runs on a pushed v tag, by hand, and on a pull request that changes the release, apps/desktop/test/release-ci.test.ts::the release workflow (STORY-65) > builds and smoke-tests every platform's installer with CI's own package jobs, apps/desktop/test/release-ci.test.ts::the release workflow (STORY-65) > attaches every installer and writes the notes and checksums, in a dry run too, tooling/test/release/plan.test.ts::the release workflow's Plan job (STORY-65) > publishes a pushed tag that matches the app's version, as a pre-release while it is 0.x, tooling/test/release/version.test.ts::the release a tag makes (STORY-65) > marks 0.x releases as pre-releases, and any version with a pre-release part, tooling/test/release/publish.test.ts::publishing a release with gh (STORY-65) > creates the release for the pushed tag as a draft with every file, then publishes it, a pre-release for 0.x, tooling/test/release/publish.test.ts::publishing a release with gh (STORY-65) > makes a 1.0 or later release the latest one, not a pre-release)
- [x] A tag that doesn't match the app's version fails before anything is built, with a message naming both versions (test: tooling/test/release/plan.test.ts::the release workflow's Plan job (STORY-65) > fails, naming both versions, when the pushed tag doesn't match, and writes no plan, tooling/test/release/version.test.ts::the release a tag makes (STORY-65) > fails, naming both versions, when the tag doesn't match the app's version, apps/desktop/test/release-ci.test.ts::the release workflow (STORY-65) > checks the tag against the app's version before anything is built)
- [x] A release isn't published unless every platform's installer passed its smoke test (test: apps/desktop/test/release-ci.test.ts::the release workflow (STORY-65) > publishes only from a pushed tag, in a last job that needs every smoke test to have passed, tooling/test/release/publish.test.ts::publishing a release with gh (STORY-65) > refuses a tag that isn't the app's version, so nothing is published for it, tooling/test/release/publish.test.ts::the commit a release tag names (STORY-65) > must be the commit that was built and tested, or nothing is published, tooling/test/release/publish.test.ts::publishing a release with gh (STORY-65) > finishes a draft a failed run left: uploads every file again, replacing any, then publishes it, tooling/test/release/publish.test.ts::publishing a release with gh (STORY-65) > fails, changing nothing, when the tag's release is already published)
- [x] The release lists the changes since the last release and has a SHA-256 checksum for each installer (test: tooling/test/release/prepare.test.ts::the notes job (STORY-65) > writes the notes, listing the pull requests merged since the last release, and the checksums file, tooling/test/release/prepare.test.ts::the notes job (STORY-65) > hashes a file as SHA-256, tooling/test/release/prepare.test.ts::the notes job (STORY-65) > counts only release tags this commit came from, not a higher tag on a branch that was never merged, tooling/test/release/notes.test.ts::a release's notes and checksums (STORY-65) > list the changes since the last release, the unsigned-build note with the install guide, and each checksum, tooling/test/release/notes.test.ts::the pull requests a release lists (STORY-65) > reads each GitHub merge's number and title, once, in git's order, tooling/test/release/notes.test.ts::the last release before a tag (STORY-65) > for a full release, is the highest full release below it, skipping release candidates (the user's call), tooling/test/release/notes.test.ts::the last release before a tag (STORY-65) > for a pre-release, is the highest release tag below it, pre-releases included, tooling/test/release/notes.test.ts::the pull requests a release lists (STORY-65) > also lists a card merged locally by its id and title, once, among GitHub's merges (the user's call), tooling/test/release/notes.test.ts::the pull requests a release lists (STORY-65) > skips syncs and merges that name no card, tooling/test/release/notes.test.ts::a release's notes and checksums (STORY-65) > list a card merged locally by its id and title, with no pull request number, tooling/test/release/prepare.test.ts::the notes job (STORY-65) > lists cards merged locally, by id and title, and skips syncs from main (the user's call))
- [x] A manual run of the release workflow builds and smoke-tests the installers without publishing anything (test: tooling/test/release/version.test.ts::the release a tag makes (STORY-65) > is a dry run, publishing nothing, when started by hand or by a pull request, tooling/test/release/plan.test.ts::the release workflow's Plan job (STORY-65) > plans a dry run that publishes nothing for a manual run, apps/desktop/test/release-ci.test.ts::the release workflow (STORY-65) > publishes only from a pushed tag, in a last job that needs every smoke test to have passed)
- [x] The app shows its version under Settings, the same version as the release it came from (test: apps/desktop/e2e/version.spec.ts::the app's version (STORY-65) > Settings shows the app's version, the one a release is tagged with, on every page, apps/desktop/e2e/installed/installed.smoke.ts::the installed app shows its version under Settings, the version its installer is named with (STORY-65), packages/client/test/components/settings/SettingsVersion.test.tsx::the app's version under Settings (STORY-65) > is under the page list, on every page, as the host reports it, tooling/test/release/plan.test.ts::the release workflow's Plan job (STORY-65) > reads the version from apps/desktop/package.json)
- [x] README has an Install section, and docs/install.md walks through the first launch on each platform: SmartScreen's "Run anyway" on Windows, Privacy & Security's "Open Anyway" on macOS, and making the AppImage executable on Linux, plus the tools Featra needs (`git`, `gh`, `claude`) (test: apps/desktop/test/install-docs.test.ts::the install guide, docs/install.md (STORY-65) > walks through the first launch on each platform, past the unsigned-app warning, apps/desktop/test/install-docs.test.ts::the install guide, docs/install.md (STORY-65) > lists the tools Featra needs: git, gh and claude, apps/desktop/test/install-docs.test.ts::the install guide, docs/install.md (STORY-65) > names each platform's installers as pnpm package builds them, apps/desktop/test/install-docs.test.ts::the README's Install section (STORY-65) > links the Releases page and the install guide, and names each platform's installer)

## Tasks

- [x] Rules: the tag and version check, as a tested script in `tooling/release/`
- [x] CI: `release.yml` on tag push and manual run, reusing the package jobs from STORY-64; publishing in a last job that needs every smoke test
- [x] Release notes from merged PRs, with a short "Unsigned build" note linking docs/install.md; checksums attached
- [x] Client: the version under Settings, from the app
- [x] Docs: README Install section, docs/install.md, how to cut a release (bump, PR, tag)
- [x] Unit and integration tests for each criterion; a dry run of the workflow and one published pre-release as its proof; tests linked on the criteria (pre-release: [v0.1.0-rc.1](https://github.com/MPiland/featra/releases/tag/v0.1.0-rc.1), published by [run 44568444932](https://github.com/MPiland/featra/actions/runs/44568444932); dry run: [run 44566543092](https://github.com/MPiland/featra/actions/runs/44566543092))
- [x] Decisions recorded for the Dev Lead; move to In Review

## Notes

The first real release (v0.1.0) is cut by the user once this story is Done: tagging publishes, so it is their call. The story's proof includes a pre-release from a test tag. Publishing it is public, so the story agent asks for the user's OK before pushing that tag; it can be deleted after if the user wants.

## Depends on

- STORY-64 Install Featra from an installer
