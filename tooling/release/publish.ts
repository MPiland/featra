/**
 * The release workflow's last job (STORY-65): `node tooling/release/publish.ts` publishes the release with `gh`, once
 * every platform's installer passed its smoke test. The workflow runs it only for a pushed tag.
 *
 * The release is made as a draft holding every file, then published, so a failed upload never leaves a public release
 * with files missing. A re-run finishes a draft an earlier run left; a release that is already published is left alone.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKSUMS_FILE, NOTES_FILE } from "./notes.ts";
import { repoEnv } from "./prepare.ts";
import { checkTag, isPrerelease } from "./version.ts";

export interface PublishInput {
  tag: string;
  version: string;
  /** owner/name. */
  repo: string;
  notesFile: string;
  /** The installers and the checksums file. */
  files: readonly string[];
}

/** The tag's release on GitHub: none yet, a draft a failed run left, or published. */
export type ReleaseState = "none" | "draft" | "published";

/** `gh release view --json isDraft`'s output, or null when gh found no release for the tag. */
export function releaseState(view: string | null): ReleaseState {
  if (view === null) return "none";
  const release: unknown = JSON.parse(view);
  const isDraft = typeof release === "object" && release !== null && "isDraft" in release && release.isDraft === true;
  return isDraft ? "draft" : "published";
}

/** The `gh` commands that publish the release, in order: each is gh's arguments. */
export function publishSteps({
  tag,
  version,
  repo,
  notesFile,
  files,
  existing,
}: PublishInput & { existing: ReleaseState }): string[][] {
  checkTag(tag, version);
  if (existing === "published") {
    throw new Error(
      `The release ${tag} is already published, so nothing was changed. To publish it again, delete it on the ` +
        "Releases page first.",
    );
  }
  const kind = isPrerelease(version) ? "--prerelease" : "--latest";
  const title = `Featra ${version}`;
  if (existing === "draft") {
    return [
      ["release", "upload", tag, "--repo", repo, "--clobber", ...files],
      ["release", "edit", tag, "--repo", repo, "--title", title, "--notes-file", notesFile, "--draft=false", kind],
    ];
  }
  return [
    // The tag must already be on GitHub: the release is never made for a tag gh would create.
    [
      "release",
      "create",
      tag,
      "--repo",
      repo,
      "--verify-tag",
      "--draft",
      "--title",
      title,
      "--notes-file",
      notesFile,
    ].concat(kind, ...files),
    ["release", "edit", tag, "--repo", repo, "--draft=false", kind],
  ];
}

/** The commit `git ls-remote --tags` says the tag names: through an annotated tag (`^{}`) to its commit. */
export function taggedCommit(lsRemote: string, tag: string): string | null {
  const refs = new Map(
    lsRemote
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha = "", ref = ""] = line.split("\t");
        return [ref, sha] as const;
      }),
  );
  return refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`) ?? null;
}

/** Fails unless the tag on GitHub still names the commit this run built and tested. */
export function checkTagCommit(tag: string, tagged: string | null, built: string): void {
  if (tagged === null) throw new Error(`The tag ${tag} isn't on GitHub, so nothing was published.`);
  if (tagged !== built) {
    throw new Error(
      `The tag ${tag} now names ${tagged}, but this run built and tested ${built}. Nothing was published.`,
    );
  }
}

/** The tag's release, from gh: null when there is none. */
function viewRelease(tag: string, repo: string): string | null {
  try {
    return execFileSync("gh", ["release", "view", tag, "--repo", repo, "--json", "isDraft"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr =
      typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr
        : "";
    if (/release not found/i.test(stderr)) return null;
    throw error;
  }
}

function main(): void {
  const env = process.env;
  const need = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`${name} isn't set.`);
    return value;
  };
  const tag = need("TAG");
  const repo = need("GITHUB_REPOSITORY");
  const lsRemote = execFileSync("git", ["ls-remote", "--tags", "origin", tag], { encoding: "utf8", env: repoEnv() });
  checkTagCommit(tag, taggedCommit(lsRemote, tag), need("GITHUB_SHA"));
  const installers = need("INSTALLERS");
  const release = need("RELEASE");
  const steps = publishSteps({
    tag,
    version: need("VERSION"),
    repo,
    notesFile: join(release, NOTES_FILE),
    files: [...readdirSync(installers).map((f) => join(installers, f)), join(release, CHECKSUMS_FILE)],
    existing: releaseState(viewRelease(tag, repo)),
  });
  for (const args of steps) execFileSync("gh", args, { stdio: "inherit" });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
