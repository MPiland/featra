/**
 * The git a story's merge needs (STORY-12, ADR 0034). The merge commit is made with plumbing (`merge-tree`, then the
 * card written into its tree), so no checkout is touched until it is published: by a fast-forward of the checkout
 * that has the feature branch, which git refuses when local changes are in the way, else by `update-ref` with the old
 * value. A conflict, a dirty target or a branch that moved meanwhile leaves every branch and file as it was. Nothing
 * here forces, rebases or runs `git commit`.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { MERGE_MESSAGES } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { BUSY_RETRY, commitWithCard, type Must } from "./card-commit.ts";
import { failed, runGit, type GitOptions } from "./git-run.ts";

/** A merge's tree, or the files that conflict. */
export type MergeTree = { tree: string } | { conflicts: string[] };

/** What a merge commit is: its parents, and the card written into it. */
export interface MergeCommitInput {
  /** The branch it lands on, first; the commit merged into it, second. One parent makes a plain card commit on it. */
  parents: readonly string[];
  path: string;
  /** The card's text; null deletes it (STORY-58). */
  text: string | null;
  message: string;
  /** Other files of the card to delete: its old names, when it was renamed. */
  drop?: readonly string[];
}

export interface RemovedStory {
  /** What couldn't be removed, as the user is told it. */
  remains: string[];
  /** Whether the worktree went: when it stays, so do the branches. */
  removed: boolean;
}

export const REMOVE_NOTES = {
  folder: (path: string) => `The worktree ${path} is still there.`,
  branch: (branch: string) => `The branch ${branch} is still there.`,
  remote: (branch: string) => `The remote branch ${branch} is still there.`,
  unmerged: (branch: string) => `The remote branch ${branch} has commits that aren't merged, so it's still there.`,
  kept: (path: string) => `The worktree ${path} has uncommitted changes, so it's still there.`,
} as const;

/** What git says when Windows still holds a file in a folder it removes. */
const BUSY = /busy|being used by another process|permission denied|directory not empty/i;

/** What a git before 2.38, whose `merge-tree` has no `--write-tree`, says to it. */
const OLD_MERGE_TREE = /usage: git merge-tree/i;

/** `git status -z` entries as paths: a rename or copy carries its old path as the next entry, which is skipped. */
function statusPaths(out: string): string[] {
  const entries = out.split("\0").filter(Boolean);
  const paths: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] ?? "";
    paths.push(entry.slice(3));
    if (entry[0] === "R" || entry[0] === "C") i++;
  }
  return paths;
}

/** `run` is the platform's git: runGit, unless a test stands in for an old or busy one. */
export function createMergeGit(gitCommand = "git", run = runGit) {
  const git = (root: string, args: string[], options?: GitOptions) => run(gitCommand, root, args, options);
  const must: Must = async (root, args, options) => {
    const r = await git(root, args, options);
    if (r.code !== 0) throw failed(`git ${args[0] ?? ""}`, r);
    return r;
  };

  /** The commit `ref` is at, or null when there is none. */
  async function commitOf(top: string, ref: string): Promise<string | null> {
    const r = await git(top, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return r.code === 0 ? r.stdout.trim() : null;
  }

  /** The working tree that has `branch` checked out, or null when none has. */
  async function checkoutOf(top: string, branch: string): Promise<string | null> {
    const blocks = (await must(top, ["worktree", "list", "--porcelain"])).stdout.split(/\r?\n\r?\n/);
    for (const block of blocks) {
      const lines = block.split(/\r?\n/);
      if (!lines.includes(`branch refs/heads/${branch}`)) continue;
      return lines.find((l) => l.startsWith("worktree "))?.slice("worktree ".length) ?? null;
    }
    return null;
  }

  /** Whether `a` is in `b`'s history (or is `b`). */
  async function isAncestor(top: string, a: string, b: string): Promise<boolean> {
    return (await git(top, ["merge-base", "--is-ancestor", a, b])).code === 0;
  }

  /** The files with changes that aren't committed in the working tree at `root`, untracked ones too, except `ignore`. */
  async function uncommitted(root: string, ignore: string): Promise<string[]> {
    const out = (await must(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])).stdout;
    return statusPaths(out).filter((p) => p !== ignore);
  }

  /** The tree that merging `theirs` into `ours` makes, or the files that conflict. Touches no checkout. */
  async function mergeTree(top: string, ours: string, theirs: string): Promise<MergeTree> {
    const args = ["merge-tree", "--write-tree", "--name-only", "--no-messages", ours, theirs];
    const r = await git(top, args);
    const [tree = "", ...files] = r.stdout.split(/\r?\n/).filter(Boolean);
    if (r.code === 0) return { tree };
    if (r.code === 1) return { conflicts: [...new Set(files)] };
    if (OLD_MERGE_TREE.test(r.stderr)) throw new ApiError(MERGE_MESSAGES.oldGit);
    throw failed("git merge-tree", r);
  }

  /**
   * The commit `input` describes: with two parents, the merge of the second into the first with the card replaced, or
   * the files that conflict; with one, that commit with the card replaced. Not on any branch yet.
   */
  async function mergeCommit(
    top: string,
    input: MergeCommitInput,
  ): Promise<{ commit: string } | { conflicts: string[] }> {
    const [ours, theirs] = input.parents;
    if (!ours) throw new Error("A merge commit needs a parent.");
    const merged = theirs ? await mergeTree(top, ours, theirs) : { tree: ours };
    if ("conflicts" in merged) return merged;
    return { commit: await commitWithCard(must, top, { ...input, tree: merged.tree }) };
  }

  /**
   * Moves `branch` from `old` to `commit`, which has `old` in its history. Where a checkout has the branch it fast-
   * forwards there, so its files follow; false, with nothing changed, when git refuses (local changes in the way) or
   * the branch moved meanwhile.
   */
  async function publish(top: string, branch: string, commit: string, old: string): Promise<boolean> {
    const checkout = await checkoutOf(top, branch);
    if (checkout === null) return (await git(top, ["update-ref", `refs/heads/${branch}`, commit, old])).code === 0;
    if ((await commitOf(checkout, "HEAD")) !== old) return false;
    return (await git(checkout, ["merge", "--ff-only", "--no-stat", "--quiet", commit])).code === 0;
  }

  /** `git worktree remove --force`, tried again briefly while Windows still holds a file in it; true once gone. */
  async function removeFolder(top: string, folder: string): Promise<boolean> {
    for (let tries = 0; ; tries++) {
      const r = await git(top, ["worktree", "remove", "--force", folder]);
      if (r.code === 0) return true;
      if (tries >= BUSY_RETRY.maxRetries || !BUSY.test(r.stderr)) return false;
      await sleep(BUSY_RETRY.retryDelay);
    }
  }

  /**
   * Removes a merged story's worktree and its local branch, which must be in `into`'s history. What can't go stays,
   * and is said. A worktree with uncommitted changes besides its card (`card`) stays whole, branch too, so `--force`
   * only ever discards the card, which the feature branch has. Only what git ignores is left to lose.
   */
  async function removeStory(
    top: string,
    folder: string,
    card: string,
    branch: string,
    into: string,
  ): Promise<RemovedStory> {
    const remains: string[] = [];
    if ((await uncommitted(folder, card)).length > 0) {
      remains.push(REMOVE_NOTES.kept(folder), REMOVE_NOTES.branch(branch));
      return { remains, removed: false };
    }
    if (!(await removeFolder(top, folder))) {
      remains.push(REMOVE_NOTES.folder(folder), REMOVE_NOTES.branch(branch));
      return { remains, removed: false };
    }
    const tip = await commitOf(top, `refs/heads/${branch}`);
    const inFeature = tip !== null && (await isAncestor(top, tip, `refs/heads/${into}`));
    if (tip !== null && (!inFeature || (await git(top, ["branch", "-D", branch])).code !== 0)) {
      remains.push(REMOVE_NOTES.branch(branch));
    }
    return { remains, removed: true };
  }

  /** The commit `branch` is at on `remote`: null when it has no such branch, undefined when it can't be reached. */
  async function remoteTip(top: string, remote: string, branch: string): Promise<string | null | undefined> {
    const ref = `refs/heads/${branch}`;
    const r = await git(top, ["ls-remote", "--heads", remote, ref]);
    if (r.code !== 0) return undefined;
    const line = r.stdout.split(/\r?\n/).find((l) => l.endsWith(`\t${ref}`));
    return line ? (line.split("\t")[0] ?? null) : null;
  }

  /**
   * Deletes `branch` on `remote` when everything on it is merged into `into`, and only at the commit read (a lease), so
   * a push that lands meanwhile is never deleted. Null once gone (one already gone counts), else what to tell the user.
   */
  async function deleteRemote(top: string, remote: string, branch: string, into: string): Promise<string | null> {
    const tip = await remoteTip(top, remote, branch);
    if (tip === null) return null;
    if (tip === undefined) return REMOVE_NOTES.remote(branch);
    if (!(await isAncestor(top, tip, `refs/heads/${into}`))) return REMOVE_NOTES.unmerged(branch);
    const r = await git(top, ["push", `--force-with-lease=refs/heads/${branch}:${tip}`, remote, "--delete", branch]);
    return r.code === 0 ? null : REMOVE_NOTES.remote(branch);
  }

  /**
   * Deletes `branch` from every remote that has it, after a merge made without GitHub, as `deleteRemote` does. A
   * remote that can't be reached, but whose copy Featra fetched before, is said; one that doesn't have it is left alone.
   */
  async function deleteFromRemotes(top: string, branch: string, into: string): Promise<string[]> {
    const remains = new Set<string>();
    const remotes = (await git(top, ["remote"])).stdout.split(/\r?\n/).filter(Boolean);
    for (const remote of remotes) {
      const tip = await remoteTip(top, remote, branch);
      if (tip === undefined && (await commitOf(top, `refs/remotes/${remote}/${branch}`))) {
        remains.add(REMOVE_NOTES.remote(branch));
      }
      if (!tip) continue;
      const note = await deleteRemote(top, remote, branch, into);
      if (note !== null) remains.add(note);
    }
    return [...remains];
  }

  /** Fetches `branch` from `remote`; the commit it is at there, or null when it couldn't. */
  async function fetchTip(top: string, remote: string, branch: string): Promise<string | null> {
    const ref = `refs/remotes/${remote}/${branch}`;
    const r = await git(top, ["fetch", "--quiet", "--no-tags", remote, `+refs/heads/${branch}:${ref}`]);
    return r.code === 0 ? commitOf(top, ref) : null;
  }

  return {
    git,
    must,
    commitOf,
    checkoutOf,
    isAncestor,
    uncommitted,
    mergeTree,
    mergeCommit,
    publish,
    removeFolder,
    removeStory,
    remoteTip,
    deleteRemote,
    deleteFromRemotes,
    fetchTip,
  };
}

export type MergeGit = ReturnType<typeof createMergeGit>;
