/**
 * The release workflow's last job (STORY-65): `node tooling/release/publish.ts` publishes the release with `gh`, once
 * every platform's installer passed its smoke test. The workflow runs it only for a pushed tag.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKSUMS_FILE, NOTES_FILE } from "./notes.ts";
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

/** `gh release create`'s arguments: the release for the tag, a pre-release for 0.x, with its notes and files. */
export function publishArgs({ tag, version, repo, notesFile, files }: PublishInput): string[] {
  checkTag(tag, version);
  return [
    "release",
    "create",
    tag,
    "--repo",
    repo,
    // The tag must already be on GitHub: the release is never made for a tag gh would create.
    "--verify-tag",
    "--title",
    `Featra ${version}`,
    "--notes-file",
    notesFile,
    isPrerelease(version) ? "--prerelease" : "--latest",
    ...files,
  ];
}

function main(): void {
  const env = process.env;
  const need = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`${name} isn't set.`);
    return value;
  };
  const installers = need("INSTALLERS");
  const release = need("RELEASE");
  const args = publishArgs({
    tag: need("TAG"),
    version: need("VERSION"),
    repo: need("GITHUB_REPOSITORY"),
    notesFile: join(release, NOTES_FILE),
    files: [...readdirSync(installers).map((f) => join(installers, f)), join(release, CHECKSUMS_FILE)],
  });
  execFileSync("gh", args, { stdio: "inherit" });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
