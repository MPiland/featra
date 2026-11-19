/**
 * The release workflow's notes job (STORY-65): `node tooling/release/prepare.ts` takes the installers every package
 * job built and tested, and writes the release's notes and checksums file beside them. A dry run does it too, so the
 * notes and checksums are checked on every run, not only when publishing.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHECKSUMS_FILE,
  checksumsText,
  MERGE_LOG_FORMAT,
  mergedPullRequests,
  NOTES_FILE,
  previousTag,
  releaseNotes,
  type Checksum,
} from "./notes.ts";

/** A file's SHA-256, in hex, read as a stream: installers run to hundreds of megabytes. */
export function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/** Runs git with these arguments in the repo and returns what it prints. */
export type Git = (args: string[]) => string;

export interface PrepareInput {
  /** The folder holding every platform's installers. */
  installers: string;
  /** Where the notes and checksums file are written. */
  out: string;
  tag: string;
  version: string;
  installGuide: string;
  git: Git;
}

export interface Prepared {
  notes: string;
  checksums: string;
  previous: string | null;
}

export async function prepareRelease({
  installers,
  out,
  tag,
  version,
  installGuide,
  git,
}: PrepareInput): Promise<Prepared> {
  const files = (await readdir(installers, { withFileTypes: true })).filter((f) => f.isFile()).map((f) => f.name);
  if (files.length === 0) throw new Error(`There are no installers in ${installers}.`);
  const checksums: Checksum[] = await Promise.all(
    files.map(async (file) => ({ file, sha256: await sha256(join(installers, file)) })),
  );
  // Only tags this commit came from: a tag on a branch that was never merged wasn't released from this line.
  const tags = git(["tag", "--list", "v*", "--merged", "HEAD"]).split("\n").filter(Boolean);
  const previous = previousTag(tags, tag);
  const log = git(["log", "--merges", `--format=${MERGE_LOG_FORMAT}`, previous ? `${previous}..HEAD` : "HEAD"]);
  const notes = releaseNotes({ version, previous, prs: mergedPullRequests(log), checksums, installGuide });
  await mkdir(out, { recursive: true });
  await writeFile(join(out, NOTES_FILE), notes);
  await writeFile(join(out, CHECKSUMS_FILE), checksumsText(checksums));
  return { notes, checksums: checksumsText(checksums), previous };
}

/**
 * Variables git sets for hooks that point it at another repository: the same list as the server's `gitEnv` drops
 * (packages/server/src/git-run.ts). A test keeps the two equal.
 */
export const REPO_OVERRIDES = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
];

/** The environment without git's repository overrides, so git works on the folder it runs in. */
export function repoEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of REPO_OVERRIDES) delete env[key];
  return env;
}

/** git in `cwd`, and only that repo, failing with git's own message. */
export const gitIn =
  (cwd: string): Git =>
  (args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: repoEnv() });

/** docs/install.md on GitHub at `ref`: the tag a release publishes, or the commit a dry run built. */
export const installGuideUrl = (server: string, repo: string, ref: string) =>
  `${server}/${repo}/blob/${ref}/docs/install.md`;

async function main(): Promise<void> {
  const env = process.env;
  const need = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`${name} isn't set.`);
    return value;
  };
  const tag = need("TAG");
  const prepared = await prepareRelease({
    installers: need("INSTALLERS"),
    out: need("OUT"),
    tag,
    version: need("VERSION"),
    installGuide: installGuideUrl(
      need("GITHUB_SERVER_URL"),
      need("GITHUB_REPOSITORY"),
      env.PUBLISH === "true" ? tag : need("GITHUB_SHA"),
    ),
    git: gitIn(process.cwd()),
  });
  process.stdout.write(`${prepared.notes}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
