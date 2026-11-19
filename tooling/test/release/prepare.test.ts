/**
 * STORY-65: the notes job's work on real files and a real git history. Only the data is made up: a temporary
 * repository whose merges look like GitHub's, and small files standing in for the installers.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitIn, installGuideUrl, prepareRelease, REPO_OVERRIDES, repoEnv, sha256 } from "../../release/prepare.ts";
import { REPO } from "../run.ts";

// Known SHA-256s: of "hello\n" and of an empty file.
const HELLO = "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03";
const EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

let root: string;
let repo: string;
/**
 * git in the temp repo, without the variables git sets for hooks. Inherited from the pre-commit hook, GIT_DIR made
 * `git init` re-initialise the real repository as bare (STORY-65's first commit).
 */
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8", env: repoEnv() });
const restore = (key: string, value: string | undefined) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

/** A pull request merged as GitHub merges it: a branch with one commit, merged with GitHub's message. */
async function mergePr(number: number, title: string) {
  const branch = `pr-${number}`;
  git("checkout", "-q", "-b", branch);
  await writeFile(join(repo, `${branch}.txt`), title);
  git("add", ".");
  git("commit", "-q", "-m", title);
  git("checkout", "-q", "main");
  git("merge", "-q", "--no-ff", branch, "-m", `Merge pull request #${number} from someone/${branch}`, "-m", title);
}

/** A branch with one commit, merged locally with `subject`, as cards were before every merge went through GitHub. */
async function mergeLocal(branch: string, subject: string) {
  git("checkout", "-q", "-b", branch);
  await writeFile(join(repo, `${branch.replaceAll("/", "-")}.txt`), subject);
  git("add", ".");
  git("commit", "-q", "-m", `Work on ${branch}`);
  git("checkout", "-q", "main");
  git("merge", "-q", "--no-ff", branch, "-m", subject);
}

beforeEach(async () => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), "featra-release-")));
  repo = join(root, "repo");
  await mkdir(repo);
  git("init", "-q", "-b", "main");
  // Never touch any other repository: stop unless git resolves to the one just made.
  if (realpathSync.native(git("rev-parse", "--show-toplevel").trim()) !== repo) {
    throw new Error("git does not resolve to the temp repository; refusing to continue");
  }
  git("config", "core.autocrlf", "false");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  await writeFile(join(repo, "README.md"), "Featra\n");
  git("add", ".");
  git("commit", "-q", "-m", "First commit");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function installers(files: Record<string, string>) {
  const dir = join(root, "installers");
  await mkdir(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}

describe("the notes job (STORY-65)", () => {
  it("hashes a file as SHA-256", async () => {
    const dir = await installers({ "a.txt": "hello\n", "b.txt": "" });
    expect(await sha256(join(dir, "a.txt"))).toBe(HELLO);
    expect(await sha256(join(dir, "b.txt"))).toBe(EMPTY);
  });

  it("writes the notes, listing the pull requests merged since the last release, and the checksums file", async () => {
    await mergePr(1, "STORY-1: Before the last release");
    git("tag", "v0.1.0");
    await mergePr(2, "STORY-2: The first change since");
    await mergePr(3, "BUG-3: The second change since");
    const dir = await installers({
      "Featra-0.2.0-x64-setup.exe": "hello\n",
      "Featra-0.2.0-universal.dmg": "",
    });
    const out = join(root, "release");
    const prepared = await prepareRelease({
      installers: dir,
      out,
      tag: "v0.2.0",
      version: "0.2.0",
      installGuide: installGuideUrl("https://github.com", "o/r", "v0.2.0"),
      git: gitIn(repo),
    });
    expect(prepared.previous).toBe("v0.1.0");
    const sums = `${EMPTY}  Featra-0.2.0-universal.dmg\n${HELLO}  Featra-0.2.0-x64-setup.exe\n`;
    expect(await readFile(join(out, "SHA256SUMS.txt"), "utf8")).toBe(sums);
    const notes = await readFile(join(out, "notes.md"), "utf8");
    expect(notes).toBe(prepared.notes);
    expect(notes).toContain(
      "\n## Changes since v0.1.0\n\n- BUG-3: The second change since (#3)\n- STORY-2: The first change since (#2)\n\n",
    );
    expect(notes).not.toContain("STORY-1");
    expect(notes).toContain("[install guide](https://github.com/o/r/blob/v0.2.0/docs/install.md)");
    expect(notes).toContain(`\n\`\`\`\n${sums}\`\`\`\n`);
  });

  it("lists cards merged locally, by id and title, and skips syncs from main (the user's call)", async () => {
    await mergePr(1, "STORY-1: Merged on GitHub");
    await mergeLocal("feature/6", "Merge FEAT-6: PRs, CI, merges and bugs");
    await mergeLocal("sync", "Merge main into feature/19-installers (BUG-31)");
    const prepared = await prepareRelease({
      installers: await installers({ "Featra-0.1.0-x64.AppImage": "hello\n" }),
      out: join(root, "release"),
      tag: "v0.1.0",
      version: "0.1.0",
      installGuide: "u",
      git: gitIn(repo),
    });
    expect(prepared.previous).toBeNull();
    expect(prepared.notes).toContain(
      "\n## Changes\n\n- FEAT-6: PRs, CI, merges and bugs\n- STORY-1: Merged on GitHub (#1)\n\n",
    );
    expect(prepared.notes).not.toContain("Merge main");
  });

  it("counts only release tags this commit came from, not a higher tag on a branch that was never merged", async () => {
    await mergePr(1, "STORY-1: Before the last release");
    git("tag", "v0.1.0");
    git("checkout", "-q", "-b", "abandoned");
    await writeFile(join(repo, "abandoned.txt"), "never merged");
    git("add", ".");
    git("commit", "-q", "-m", "Never merged");
    git("tag", "v0.1.5");
    git("checkout", "-q", "main");
    await mergePr(2, "STORY-2: The change since");
    const prepared = await prepareRelease({
      installers: await installers({ "Featra-0.2.0-x64.AppImage": "hello\n" }),
      out: join(root, "release"),
      tag: "v0.2.0",
      version: "0.2.0",
      installGuide: "u",
      git: gitIn(repo),
    });
    expect(prepared.previous).toBe("v0.1.0");
    expect(prepared.notes).toContain("\n## Changes since v0.1.0\n\n- STORY-2: The change since (#2)\n\n");
  });

  it("lists every merged pull request for the first release", async () => {
    await mergePr(1, "STORY-1: The start");
    const prepared = await prepareRelease({
      installers: await installers({ "Featra-0.1.0-x64.AppImage": "hello\n" }),
      out: join(root, "release"),
      tag: "v0.1.0",
      version: "0.1.0",
      installGuide: "u",
      git: gitIn(repo),
    });
    expect(prepared.previous).toBeNull();
    expect(prepared.notes).toContain("\n## Changes\n\n- STORY-1: The start (#1)\n");
  });

  it("reads its own repo's history when git's hook variables point at another repo", async () => {
    // The pre-commit hook runs the tests with GIT_DIR and GIT_INDEX_FILE set. Point them at a second temp repo.
    await mergePr(7, "STORY-7: Only in this repo");
    const other = join(root, "other");
    await mkdir(other);
    execFileSync("git", ["init", "-q", "-b", "main", other], { env: repoEnv() });
    const saved = { dir: process.env.GIT_DIR, index: process.env.GIT_INDEX_FILE };
    process.env.GIT_DIR = join(other, ".git");
    process.env.GIT_INDEX_FILE = join(other, ".git", "index");
    try {
      const prepared = await prepareRelease({
        installers: await installers({ "Featra-0.1.0-x64.AppImage": "hello\n" }),
        out: join(root, "release"),
        tag: "v0.1.0",
        version: "0.1.0",
        installGuide: "u",
        git: gitIn(repo),
      });
      expect(prepared.notes).toContain("- STORY-7: Only in this repo (#7)\n");
    } finally {
      restore("GIT_DIR", saved.dir);
      restore("GIT_INDEX_FILE", saved.index);
    }
  });

  it("drops the same git variables as the server does", () => {
    // The server's list (packages/server/src/git-run.ts) isn't importable here, so it is read from the source.
    const source = readFileSync(join(REPO, "packages", "server", "src", "git-run.ts"), "utf8");
    const list = /const REPO_OVERRIDES = \[([^\]]*)\]/.exec(source)?.[1] ?? "";
    expect([...list.matchAll(/"(GIT_\w+)"/g)].map((m) => m[1])).toEqual(REPO_OVERRIDES);
  });

  it("fails when there are no installers", async () => {
    const dir = await installers({});
    await expect(
      prepareRelease({
        installers: dir,
        out: join(root, "release"),
        tag: "v0.1.0",
        version: "0.1.0",
        installGuide: "u",
        git: gitIn(repo),
      }),
    ).rejects.toThrow(`There are no installers in ${dir}.`);
  });
});
