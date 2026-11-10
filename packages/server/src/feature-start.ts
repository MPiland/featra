/**
 * Starting an approved feature (STORY-52, ADR 0024): `feature/<N>-<slug>` is made from the base branch and the feature
 * is active on it, and main's checkout is never touched (no switch, no change to its files or index). The branch is
 * made in a temporary worktree on a new branch: the feature's card, as the base branch has it, is changed there
 * (active, with a status event) and committed with the repository's own hooks, never `--no-verify`, never pushed. Then
 * the worktree goes, and the branch stays. Ownership then moves by the ordinary rules (`ownerOf`): a started feature,
 * and its stories, belong to its branch. It runs in the card lane and is all or nothing: if anything fails the worktree
 * and the branch are removed, so no half-made branch is left.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  errorMessage,
  existingBranchOf,
  featureBranchName,
  notStartableReason,
  parseCard,
  serializeCard,
  startedFeature,
  startMessage,
  toIso,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { fileIn, writeAtomic } from "./card-actions.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import { failed, runGit, type Run } from "./git-run.ts";
import type { Scan } from "./work-scan.ts";

export const START_MESSAGES = {
  notProject: "This folder isn't a Featra project in git.",
  noBranch: (base: string) => `There's no ${base} branch. Create it, or set baseBranch in .featra/config.yaml.`,
  exists: (id: string, branch: string) => `${id} already has a branch, ${branch}.`,
  notApprovedOnBase: (id: string, base: string) => `${id} isn't approved on ${base} yet. Commit it there first.`,
  failed: (id: string, why: string) => `Couldn't start ${id}; nothing was changed. ${why}`,
  failedAndLeft: (id: string, why: string, left: string) =>
    `Couldn't start ${id}, and cleaning up failed too, so check git branch and git worktree list. ${why} ${left}`,
} as const;

export interface FeatureStartDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The lane every card write goes through; the server shares one. */
  lane?: CardLane;
  /** The git command (default `git`). */
  gitCommand?: string;
  /** Where the temporary worktree is made (default: the system's temporary folder). */
  tempRoot?: string;
  /** How the started feature reaches the temporary worktree. Default: atomically. */
  write?: (file: string, text: string) => Promise<void>;
}

export interface StartResult {
  branch: string;
}

export function createFeatureStart({
  scan: scanDir,
  now,
  lane = createCardLane(),
  gitCommand = "git",
  tempRoot = tmpdir(),
  write = writeAtomic,
}: FeatureStartDeps) {
  const git = (root: string, args: string[]) => runGit(gitCommand, root, args);
  const must = async (root: string, args: string[]): Promise<Run> => {
    const r = await git(root, args);
    if (r.code !== 0) throw failed(`git ${args[0] ?? ""}`, r);
    return r;
  };

  /** Removes the temporary worktree (and git's record of it), whatever state it is in; throws what couldn't go. */
  async function removeWorktree(top: string, folder: string, tree: string): Promise<void> {
    const removed = await git(top, ["worktree", "remove", "--force", tree]).catch(() => null);
    if (removed?.code !== 0) await rm(tree, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    await rm(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    await must(top, ["worktree", "prune"]);
  }

  async function start(dir: string, id: string, by: string): Promise<StartResult> {
    const scan = await scanDir(dir);
    const top = scan?.collected.paths.top;
    if (!scan || !top) throw new ApiError(START_MESSAGES.notProject);
    const owned = scan.resolution.cards.find((c) => c.card.id === id);
    const refusal = notStartableReason(owned?.card, id);
    if (refusal !== null || !owned) throw new ApiError(refusal ?? "That card is gone.");

    // Git answers here, not the scan, which may be reusing what git said earlier.
    const base = scan.collected.config.baseBranch;
    const found = await git(top, ["rev-parse", "--verify", "-q", `refs/heads/${base}^{commit}`]);
    if (found.code !== 0) throw new ApiError(START_MESSAGES.noBranch(base));
    const names = (await must(top, ["for-each-ref", "--format=%(refname:short)", "refs/heads"])).stdout
      .split(/\r?\n/)
      .filter(Boolean);
    const branch = featureBranchName(owned.card);
    const existing = names.includes(branch) ? branch : existingBranchOf(id, names);
    if (existing !== null) throw new ApiError(START_MESSAGES.exists(id, existing));

    // The feature as the base branch has it: what Approve committed, not whatever main's working tree holds now.
    const committed = await git(top, ["show", `refs/heads/${base}:${owned.path}`]);
    const onBase = committed.code === 0 ? parseCard(committed.stdout, owned.path) : undefined;
    if (notStartableReason(onBase, id) !== null || !onBase)
      throw new ApiError(START_MESSAGES.notApprovedOnBase(id, base));
    const started = startedFeature(onBase, by, toIso(now()));

    const folder = await mkdtemp(join(tempRoot, "featra-start-"));
    const tree = join(folder, "tree");
    try {
      await must(top, ["worktree", "add", "-q", "-b", branch, tree, `refs/heads/${base}`]);
      await write(fileIn(tree, owned.path), serializeCard(started));
      await must(tree, ["add", "--", owned.path]);
      await must(tree, ["commit", "-m", startMessage(started), "--", owned.path]);
      await removeWorktree(top, folder, tree);
    } catch (err) {
      const why = err instanceof Error ? err.message : errorMessage(err);
      const left: string[] = [];
      await removeWorktree(top, folder, tree).catch((e: unknown) => left.push(errorMessage(e)));
      const made = await git(top, ["rev-parse", "--verify", "-q", `refs/heads/${branch}`]).catch(() => null);
      if (made?.code === 0) {
        await must(top, ["branch", "-D", branch]).catch((e: unknown) => left.push(errorMessage(e)));
      }
      throw new ApiError(
        left.length ? START_MESSAGES.failedAndLeft(id, why, left.join(" ")) : START_MESSAGES.failed(id, why),
      );
    }
    await scanDir(dir);
    return { branch };
  }

  return {
    /** Starts approved feature `id` as `by` (`user`, or `session:<chat>`): its branch, active, unpushed. */
    start: (dir: string, id: string, by: string): Promise<StartResult> => lane.exclusive(() => start(dir, id, by)),
  };
}

export type FeatureStart = ReturnType<typeof createFeatureStart>;
