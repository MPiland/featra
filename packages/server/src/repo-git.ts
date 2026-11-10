/**
 * The git reads and restores the Work list needs (ADR 0016): where the repository is, its worktrees and branches,
 * and card files in commits that aren't checked out. Every call runs the real `git`; tests use it in temp folders.
 */
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CARDS_DIR } from "@featra/work-format";
import { openBatch, treeEntries } from "./git-batch.ts";
import { failed, runGit } from "./git-run.ts";

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

/** A card file as a commit has it. */
export interface CommittedFile {
  path: string;
  text: string;
}

/** Keeps blob texts by SHA (the index): answers from what it has, and from `load` for the rest. */
export type BlobCache = (
  shas: readonly string[],
  load: (missing: string[]) => Promise<Map<string, string>>,
) => Promise<Map<string, string>>;

export interface RepoGit {
  /** Null when `dir` isn't in a git work tree. */
  paths: (dir: string) => Promise<RepoPaths | null>;
  worktrees: (top: string) => Promise<WorktreeInfo[]>;
  branches: (top: string, base: string) => Promise<BranchInfo[]>;
  /**
   * The repository's default branch when the config doesn't name one (STORY-51): the local branch `origin/HEAD` points
   * at, else `main`, else `master`; in a repository with no commits, the branch HEAD is on. Null when none of those.
   */
  defaultBranch: (top: string) => Promise<string | null>;
  /**
   * The card files in `.featra/cards/` at each commit or branch of `revs`, by rev. One `git cat-file --batch` reads
   * the trees, then the blobs `cache` doesn't have (BUG-6).
   */
  committedCards: (top: string, revs: readonly string[], cache: BlobCache) => Promise<Map<string, CommittedFile[]>>;
  /** Puts `path` back as HEAD has it in the working tree at `root`, or removes it when HEAD has none. */
  restore: (root: string, path: string, inHead: boolean) => Promise<void>;
}

const NO_COMMIT = /^0+$/;

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
    async defaultBranch(top) {
      const listed = await run(top, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]);
      const local = new Set(listed.stdout.split(/\r?\n/).filter(Boolean));
      const origin = await run(top, ["symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD"]);
      const named = origin.code === 0 ? origin.stdout.trim().replace(/^origin\//, "") : "";
      if (named && local.has(named)) return named;
      for (const name of ["main", "master"]) if (local.has(name)) return name;
      if (local.size) return null;
      const unborn = await run(top, ["symbolic-ref", "--short", "-q", "HEAD"]);
      return unborn.code === 0 && unborn.stdout.trim() ? unborn.stdout.trim() : null;
    },
    async committedCards(top, revs, cache) {
      const byRev = new Map<string, CommittedFile[]>();
      if (!revs.length) return byRev;
      const batch = openBatch(command, top);
      try {
        const trees = await batch.get(revs.map((rev) => `${rev}:${CARDS_DIR}`));
        const files = trees.map((tree) =>
          treeEntries(tree)
            .filter((e) => e.kind === "blob" && e.name.endsWith(".md"))
            .map((e) => ({ path: `${CARDS_DIR}/${e.name}`, sha: e.sha })),
        );
        const texts = await cache([...new Set(files.flat().map((f) => f.sha))], async (missing) => {
          const blobs = await batch.get(missing);
          const found = new Map<string, string>();
          blobs.forEach((b, i) => {
            if (b?.type === "blob") found.set(missing[i] ?? "", b.data.toString("utf8"));
          });
          return found;
        });
        revs.forEach((rev, i) => {
          byRev.set(
            rev,
            (files[i] ?? []).map((f) => ({ path: f.path, text: texts.get(f.sha) ?? "" })),
          );
        });
        return byRev;
      } finally {
        await batch.close();
      }
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
