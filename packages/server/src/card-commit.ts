/**
 * Featra's card-only bookkeeping commit (STORY-52, ADR 0024), shared by starting a feature and by a story added to a
 * started feature (STORY-9), and the merge commit that brings a story into its feature (STORY-12, ADR 0034): built
 * with git plumbing so no checkout, index, hook or file of the user's is touched. The card becomes a blob, a temporary
 * index seeded from a tree takes that one path, `write-tree` and `commit-tree` make the commit, and the caller
 * publishes it with `update-ref` (or a fast-forward of the checkout that has the branch).
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { GitOptions, Run } from "./git-run.ts";

/** How long a file Windows still holds is retried before giving up: briefly, as `rm` does here. */
export const BUSY_RETRY = { maxRetries: 20, retryDelay: 100 } as const;

/** Runs git in `root` and throws when it fails. */
export type Must = (root: string, args: string[], options?: GitOptions) => Promise<Run>;

export interface CardCommit {
  /** The new commit, not yet on any branch. */
  commit: string;
  /** The commit it is made on: what a branch must still be at for the commit to replace it. */
  parent: string;
}

/** The commit: `parentRef`'s tree with the one card `path` replaced by `text`, in a temporary index that is gone afterwards. */
export async function commitCard(
  must: Must,
  top: string,
  parentRef: string,
  path: string,
  text: string,
  message: string,
): Promise<CardCommit> {
  const parent = (await must(top, ["rev-parse", "--verify", `${parentRef}^{commit}`])).stdout.trim();
  const commit = await commitWithCard(must, top, { tree: parent, parents: [parent], path, text, message });
  return { commit, parent };
}

export interface CardTree {
  /** The tree (or a commit, whose tree it is) the card goes into. */
  tree: string;
  /** The new commit's parents: one, or two for a merge commit. */
  parents: readonly string[];
  path: string;
  text: string;
  message: string;
}

/** A commit of `tree` with the one card `path` replaced by `text`, on `parents`. Not on any branch. */
export async function commitWithCard(must: Must, top: string, { tree, parents, path, text, message }: CardTree) {
  const gitDir = (await must(top, ["rev-parse", "--absolute-git-dir"])).stdout.trim();
  const index = join(gitDir, `featra-card-${process.pid}-${Date.now()}.index`);
  const env = { GIT_INDEX_FILE: index };
  try {
    const blob = (await must(top, ["hash-object", "-w", "--no-filters", "--stdin"], { input: text })).stdout.trim();
    await must(top, ["read-tree", tree], { env });
    await must(top, ["update-index", "--add", "--cacheinfo", `100644,${blob},${path}`], { env });
    const written = (await must(top, ["write-tree"], { env })).stdout.trim();
    const args = ["commit-tree", written, ...parents.flatMap((p) => ["-p", p]), "-m", message];
    return (await must(top, args)).stdout.trim();
  } finally {
    await rm(index, { force: true, ...BUSY_RETRY });
  }
}
