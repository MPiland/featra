/**
 * The git reads and restores the Work list needs (ADR 0016): where the repository is, its worktrees and branches,
 * and card files in commits that aren't checked out. Every call runs the real `git`; tests use it in temp folders.
 */
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CARDS_DIR } from "@featra/work-format";
import { failed, runGit, runGitBytes } from "./git-run.ts";

export interface RepoPaths {
  /** The working tree the opened folder is in. */
  top: string;
  /** The folder every worktree shares (`.git` of the main checkout). */
  common: string;
}

export interface WorktreeInfo {
  path: string;
  /** Null for a detached HEAD. */
  branch: string | null;
  /** Null before the first commit. */
  head: string | null;
}

export interface BranchInfo {
  name: string;
  /** Whether the tip is in the base branch (`git for-each-ref --merged`). */
  inBase: boolean;
}

export interface TreeFile {
  path: string;
  sha: string;
}

export interface RepoGit {
  /** Null when `dir` isn't in a git work tree. */
  paths: (dir: string) => Promise<RepoPaths | null>;
  worktrees: (top: string) => Promise<WorktreeInfo[]>;
  branches: (top: string, base: string) => Promise<BranchInfo[]>;
  /** The card files in `.featra/cards/` at commit or branch `rev`. */
  cardFiles: (top: string, rev: string) => Promise<TreeFile[]>;
  /** The texts of these blobs, by SHA. */
  blobs: (top: string, shas: readonly string[]) => Promise<Map<string, string>>;
  /** Puts `path` back as HEAD has it in the working tree at `root`, or removes it when HEAD has none. */
  restore: (root: string, path: string, inHead: boolean) => Promise<void>;
}

const NO_COMMIT = /^0+$/;
const CARDS_PREFIX = `${CARDS_DIR}/`;

function parseWorktrees(text: string): WorktreeInfo[] {
  const out: WorktreeInfo[] = [];
  for (const block of text.split("\n\n")) {
    const lines = block.split("\n").filter(Boolean);
    const path = lines.find((l) => l.startsWith("worktree "))?.slice("worktree ".length);
    if (!path || lines.includes("bare")) continue;
    const head = lines.find((l) => l.startsWith("HEAD "))?.slice(5) ?? null;
    const ref = lines.find((l) => l.startsWith("branch "))?.slice(7) ?? null;
    out.push({
      path: resolve(path),
      branch: ref?.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null,
      head: head && !NO_COMMIT.test(head) ? head : null,
    });
  }
  return out;
}

/** Reads `git cat-file --batch` output: `<sha> blob <size>\n<bytes>\n` per object, `<sha> missing\n` for none. */
function parseBatch(out: Buffer): Map<string, string> {
  const texts = new Map<string, string>();
  let at = 0;
  while (at < out.length) {
    const eol = out.indexOf(10, at);
    if (eol < 0) break;
    const [sha = "", type, size] = out.subarray(at, eol).toString("utf8").split(" ");
    at = eol + 1;
    if (type === undefined || size === undefined) continue;
    const n = Number(size);
    if (type === "blob") texts.set(sha, out.subarray(at, at + n).toString("utf8"));
    at += n + 1;
  }
  return texts;
}

export function createRepoGit(command = "git"): RepoGit {
  const run = (dir: string, args: string[]) => runGit(command, dir, args);
  const ok = async (dir: string, args: string[]) => {
    const r = await run(dir, args);
    if (r.code !== 0) throw failed(`git ${args[0] ?? ""}`, r);
    return r.stdout;
  };

  return {
    async paths(dir) {
      const r = await run(dir, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"]);
      if (r.code !== 0) {
        if (/not a git repository/i.test(r.stderr)) return null;
        throw failed("git rev-parse", r);
      }
      const [top, common] = r.stdout.trim().split(/\r?\n/);
      return top && common ? { top: resolve(top), common: resolve(common) } : null;
    },
    async worktrees(top) {
      return parseWorktrees(await ok(top, ["worktree", "list", "--porcelain"]));
    },
    async branches(top, base) {
      // Side by side: each git start adds to every scan, about 200 ms apiece on Windows under load (BUG-5).
      const [listed, merged] = await Promise.all([
        ok(top, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]),
        run(top, ["for-each-ref", `--merged=refs/heads/${base}`, "--format=%(refname:short)", "refs/heads"]),
      ]);
      const all = listed.split("\n");
      // No base branch yet (no commits): nothing is in it.
      const inBase = new Set(merged.code === 0 ? merged.stdout.split("\n") : []);
      return all.filter(Boolean).map((name) => ({ name, inBase: inBase.has(name) }));
    },
    async cardFiles(top, rev) {
      const out = await ok(top, ["ls-tree", "-z", rev, "--", CARDS_PREFIX]);
      const files: TreeFile[] = [];
      for (const entry of out.split("\0")) {
        const tab = entry.indexOf("\t");
        const [, type, sha] = entry.slice(0, tab).split(" ");
        const path = entry.slice(tab + 1);
        if (type === "blob" && sha && path.startsWith(CARDS_PREFIX) && path.endsWith(".md")) files.push({ path, sha });
      }
      return files;
    },
    async blobs(top, shas) {
      if (!shas.length) return new Map();
      return parseBatch(await runGitBytes(command, top, ["cat-file", "--batch"], `${shas.join("\n")}\n`));
    },
    async restore(root, path, inHead) {
      if (inHead) {
        await ok(root, ["restore", "--source=HEAD", "--staged", "--worktree", "--", path]);
        return;
      }
      await ok(root, ["rm", "--cached", "--force", "--ignore-unmatch", "--quiet", "--", path]);
      await rm(join(root, ...path.split("/")), { force: true });
    },
  };
}
