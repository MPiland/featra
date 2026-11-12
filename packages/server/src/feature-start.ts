/**
 * Starting an approved feature (STORY-52, ADR 0024): `feature/<N>-<slug>` is made from the base branch and the feature
 * is active on it. Featra's own card-only bookkeeping commit is built with git plumbing and published to a branch with
 * no checkout, so no hook runs and nothing in the user's checkout is touched (no switch, no file, no index): the
 * updated card becomes a blob, a temporary index seeded from the base commit's tree takes that one path, `write-tree`
 * and `commit-tree` make the commit, and `update-ref` creates the branch only if it doesn't exist. Never pushed.
 * Ownership then moves by the ordinary rules (`ownerOf`): a started feature, and its stories, belong to its branch.
 * It runs in the card lane and is all or nothing: nothing is published until the last step, an object left behind is
 * unreferenced, and a branch somebody else made is never deleted.
 */
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
import { commitCard } from "./card-commit.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import { failed, runGit, type GitOptions, type Run } from "./git-run.ts";
import type { Scan } from "./work-scan.ts";

export const START_MESSAGES = {
  notProject: "This folder isn't a Featra project in git.",
  noBranch: (base: string) => `There's no ${base} branch. Create it, or set baseBranch in .featra/config.yaml.`,
  exists: (id: string, branch: string) => `${id} already has a branch, ${branch}.`,
  remoteExists: (id: string, branch: string) => `${id} already has a remote branch, ${branch}. Check it out instead.`,
  notApprovedOnBase: (id: string, base: string) => `${id} isn't approved on ${base} yet. Commit it there first.`,
  failed: (id: string, why: string) => `Couldn't start ${id}; nothing was changed. ${why}`,
} as const;

export interface FeatureStartDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The lane every card write goes through; the server shares one. */
  lane?: CardLane;
  /** The git command (default `git`). */
  gitCommand?: string;
  /** A seam for tests: runs just before the branch is created, when everything else is ready. */
  beforeBranch?: () => Promise<void>;
}

export interface StartResult {
  branch: string;
}

/** A remote-tracking ref without its remote's name: `refs/remotes/origin/feature/5-x` is `feature/5-x`. */
function remoteBranches(refs: string[]): { ref: string; branch: string }[] {
  return refs.flatMap((full) => {
    const rest = full.slice("refs/remotes/".length);
    const branch = rest.slice(rest.indexOf("/") + 1);
    return rest.includes("/") && branch !== "HEAD" ? [{ ref: rest, branch }] : [];
  });
}

export function createFeatureStart({
  scan: scanDir,
  now,
  lane = createCardLane(),
  gitCommand = "git",
  beforeBranch,
}: FeatureStartDeps) {
  const git = (root: string, args: string[], options?: GitOptions) => runGit(gitCommand, root, args, options);
  const must = async (root: string, args: string[], options?: GitOptions): Promise<Run> => {
    const r = await git(root, args, options);
    if (r.code !== 0) throw failed(`git ${args[0] ?? ""}`, r);
    return r;
  };
  const refs = async (top: string, prefix: string, format: string) =>
    (await must(top, ["for-each-ref", `--format=${format}`, prefix])).stdout.split(/\r?\n/).filter(Boolean);

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

    // The feature as the base branch has it (what Approve committed), not whatever main's working tree holds now:
    // the branch is named from it, and it is what the new commit changes.
    const committed = await git(top, ["show", `refs/heads/${base}:${owned.path}`]);
    const onBase = committed.code === 0 ? parseCard(committed.stdout, owned.path) : undefined;
    if (notStartableReason(onBase, id) !== null || !onBase)
      throw new ApiError(START_MESSAGES.notApprovedOnBase(id, base));
    const branch = featureBranchName(onBase);

    const local = await refs(top, "refs/heads", "%(refname:short)");
    const existing = local.includes(branch) ? branch : existingBranchOf(id, local);
    if (existing !== null) throw new ApiError(START_MESSAGES.exists(id, existing));
    const remote = remoteBranches(await refs(top, "refs/remotes", "%(refname)"));
    const onRemote = remote.find((r) => r.branch === branch || existingBranchOf(id, [r.branch]) !== null);
    if (onRemote) throw new ApiError(START_MESSAGES.remoteExists(id, onRemote.ref));

    const started = startedFeature(onBase, by, toIso(now()));
    try {
      const { commit } = await commitCard(
        must,
        top,
        `refs/heads/${base}`,
        owned.path,
        serializeCard(started),
        startMessage(started),
      );
      await beforeBranch?.();
      // The empty old value makes this create-only: it fails if the branch exists by now, and then it isn't ours to touch.
      await must(top, ["update-ref", `refs/heads/${branch}`, commit, ""]);
    } catch (err) {
      const raced = await git(top, ["rev-parse", "--verify", "-q", `refs/heads/${branch}`]).catch(() => null);
      if (raced?.code === 0) throw new ApiError(START_MESSAGES.exists(id, branch));
      throw new ApiError(START_MESSAGES.failed(id, err instanceof Error ? err.message : errorMessage(err)));
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
