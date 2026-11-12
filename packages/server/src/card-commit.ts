/**
 * Featra's card-only bookkeeping commit (STORY-52, ADR 0024), shared by starting a feature and by a story added to a
 * started feature (STORY-9): built with git plumbing so no checkout, index, hook or file of the user's is touched. The
 * card becomes a blob, a temporary index seeded from the parent's tree takes that one path, `write-tree` and
 * `commit-tree` make the commit, and the caller publishes it with `update-ref`.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { GitOptions, Run } from "./git-run.ts";

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
  const gitDir = (await must(top, ["rev-parse", "--absolute-git-dir"])).stdout.trim();
  const index = join(gitDir, `featra-start-${process.pid}-${Date.now()}.index`);
  const env = { GIT_INDEX_FILE: index };
  try {
    const blob = (await must(top, ["hash-object", "-w", "--no-filters", "--stdin"], { input: text })).stdout.trim();
    await must(top, ["read-tree", parent], { env });
    await must(top, ["update-index", "--add", "--cacheinfo", `100644,${blob},${path}`], { env });
    const tree = (await must(top, ["write-tree"], { env })).stdout.trim();
    const commit = (await must(top, ["commit-tree", tree, "-p", parent, "-m", message])).stdout.trim();
    return { commit, parent };
  } finally {
    await rm(index, { force: true, maxRetries: 20, retryDelay: 100 });
  }
}
