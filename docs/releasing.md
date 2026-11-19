# Releasing Featra

A release publishes the installers to GitHub Releases (ADR 0040, STORY-65). Pushing a `vX.Y.Z` tag starts it, so only
the maintainer pushes release tags: a tag publishes, with no second step.

## Cut a release

1. **Bump the version** in `apps/desktop/package.json`, the one place it is kept, in a pull request. Use SemVer:
   `0.2.0`, or `0.2.0-rc.1` for a release candidate. Merge it to main.
2. **Tag that commit on main** with `v` and the version, and push the tag:

   ```bash
   git switch main && git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. **Watch the Release workflow** in the Actions tab. When it's green, the release is on the Releases page.

## What the workflow does

`.github/workflows/release.yml` runs four jobs:

- **Plan** (`tooling/release/plan.ts`) checks the tag against the app's version before anything is built. A tag that
  doesn't match fails here, naming both versions.
- **Installers** runs the same package jobs as CI (`package.yml`): each platform's installer is built, installed and
  smoke-tested on its own runner.
- **Notes and checksums** (`tooling/release/prepare.ts`) writes the release notes, listing the pull requests merged
  since the last release tag, and `SHA256SUMS.txt`.
- **Publish** (`tooling/release/publish.ts`) runs only for a pushed tag, and only when every smoke test passed. It
  creates the release with `gh`, attaching the installers and `SHA256SUMS.txt`.

0.x versions and versions with a pre-release part (`1.0.0-rc.1`) are published as pre-releases. From 1.0.0 a release
is the latest one.

## Dry runs

Any run that isn't a pushed tag is a dry run: it builds and smoke-tests the installers and writes the notes and
checksums (uploaded as the `release-notes` artifact), but publishes nothing.

- A pull request that changes `release.yml`, `package.yml` or `tooling/release/` dry-runs the release.
- **Run workflow** on the Actions tab, or `gh workflow run release.yml -R MPiland/featra --ref <branch>`. GitHub only
  offers manual runs for workflows on the default branch, so this works once `release.yml` is on main.

## If a release fails

Nothing is published unless every job before Publish passed. Fix the cause in a pull request, then delete the tag and
push it again on the fixed commit:

```bash
git push origin :refs/tags/v0.2.0
git tag -f v0.2.0 <fixed commit>
git push origin v0.2.0
```

If Publish itself failed after the release was created, delete the release on the Releases page first.
