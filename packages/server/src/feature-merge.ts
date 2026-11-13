/**
 * Merge to main (STORY-14, ADR 0037): an accepted feature merges into the base branch with a merge commit, by the
 * user's click only, once nothing stops it (feature-end.ts). It shares STORY-12's merge path: on GitHub its PR merges
 * with `gh pr merge --merge --match-head-commit` at the commit its checks passed on, and the Done card is then
 * committed onto the base as GitHub has it (merge-settle's `cardOnBranch`); else the merge commit is made by plumbing
 * with the Done card in it and published to the base. Either way the user's checkout of the base is touched only when
 * it is clean and at the base's tip. Never squash, rebase or force. Once the base has the feature, its cards are the
 * base's (ADR 0002), and the feature is Done. A PR merged on GitHub outside Featra settles the same way (`settle`).
 */
import {
  acceptedFeature,
  doneFeature,
  evidenceState,
  FEATURE_END_MESSAGES,
  GITHUB_COPY,
  mergeCommitMessage,
  serializeCard,
  toIso,
  type FeatureMergeState,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { CardLane } from "./card-lane.ts";
import { githubRemote, type GithubRemote } from "./github-detect.ts";
import { mergePr, prMergeable } from "./github-merge.ts";
import type { GithubPrDeps } from "./github-prs.ts";
import { lookAt, type FeatureLook } from "./feature-look.ts";
import type { FeaturePrs } from "./feature-pr.ts";
import type { MergeGit } from "./merge-git.ts";
import { cardOnBranch, SETTLE_NOTES } from "./merge-settle.ts";
import type { Scan } from "./work-scan.ts";

export interface FeatureMergeDeps extends GithubPrDeps {
  scan: (dir: string) => Promise<Scan | null>;
  git: MergeGit;
  lane: CardLane;
  now: () => Date;
  prs: Pick<FeaturePrs, "readNow">;
  /** Whether GitHub is usable for the project. */
  github: (dir: string) => Promise<boolean>;
  /** Whether the feature can merge now, from facts read fresh. */
  check: (dir: string, look: FeatureLook) => Promise<FeatureMergeState>;
}

export const MERGE_NOTES = {
  checkedOut: (branch: string, base: string) =>
    `${branch} is still checked out, so its cards stay there. Check out ${base}.`,
  failed: "Couldn't merge.",
} as const;

const keyOf = (dir: string, id: string) => `${dir}\0${id}`;

/** What stays to do after the merge: a checkout of the feature branch keeps its cards there. */
const leftover = (look: FeatureLook) => (look.root ? [MERGE_NOTES.checkedOut(look.branch, look.base)] : []);

export function createFeatureMerge(deps: FeatureMergeDeps) {
  const { scan: scanDir, git, lane, now } = deps;
  const merging = new Set<string>();

  /** The feature read fresh: accepted, in progress, with its branch; throws why not. */
  async function ready(dir: string, id: string): Promise<FeatureLook> {
    const look = await lookAt(git, await scanDir(dir), id);
    if (!look) throw new ApiError(FEATURE_END_MESSAGES.notActive(id));
    if (!acceptedFeature(look.card)) throw new ApiError(FEATURE_END_MESSAGES.notAccepted(id));
    return look;
  }

  const done = (look: FeatureLook, pr: string | null) =>
    serializeCard(doneFeature(look.card, look.branch, look.base, pr ?? look.card.pr, "system", toIso(now())));

  /** What stays to do once the base has the feature: a checkout of its branch keeps its cards. */
  /** The merge commit into the base, with the Done card in it, made and published in the lane. */
  const mergeLocally = (dir: string, id: string) =>
    lane.exclusive(async () => {
      const look = await ready(dir, id);
      const old = await git.commitOf(look.top, `refs/heads/${look.base}`);
      if (!old) throw new ApiError(MERGE_NOTES.failed);
      if (!(await git.isAncestor(look.top, old, look.tip))) throw new ApiError(FEATURE_END_MESSAGES.behind(look.base));
      const message = mergeCommitMessage(look.card);
      const made = await git.mergeCommit(look.top, {
        parents: [old, look.tip],
        path: look.path,
        text: done(look, null),
        message,
      });
      if ("conflicts" in made) throw new ApiError(FEATURE_END_MESSAGES.conflicts(look.base));
      if (!(await git.publish(look.top, look.base, made.commit, old, true))) {
        throw new ApiError(FEATURE_END_MESSAGES.baseBusy(look.base));
      }
      await scanDir(dir);
      return { remains: leftover(look) };
    });

  /** The Done card committed onto the base as GitHub has it, after its PR merged there; what stays to do. */
  const settle = (dir: string, id: string, remote: GithubRemote, pr: string | null) =>
    lane.exclusive(async () => {
      const look = await lookAt(git, await scanDir(dir), id);
      if (!look || !evidenceState(look.card).accepted) return { remains: [] };
      const card = { path: look.path, text: done(look, pr), id };
      const made = await cardOnBranch(git, look.top, remote.name, look.base, card, true);
      if (typeof made === "string") return { remains: [made] };
      await scanDir(dir);
      const ahead = made.ahead === null ? [] : [SETTLE_NOTES.ahead(look.base, made.ahead)];
      return { remains: [...ahead, ...leftover(look)] };
    });

  /** The feature's PR merged on GitHub, at the commit its branch is at and its checks passed on. */
  async function mergeOnGithub(dir: string, id: string) {
    const look = await ready(dir, id);
    if (!look.card.pr) throw new ApiError(FEATURE_END_MESSAGES.noPr);
    const remote = await githubRemote(dir, deps.gitCommand);
    if (!remote) throw new ApiError(GITHUB_COPY.noRemote);
    const pr = await deps.prs.readNow(dir, id, look.card.pr);
    if (!pr) throw new ApiError(MERGE_NOTES.failed);
    if (pr.status.state === "merged") return settle(dir, id, remote, pr.url);
    if (pr.status.state === "closed") throw new ApiError(FEATURE_END_MESSAGES.prClosed);
    if (pr.head !== look.tip) throw new ApiError(FEATURE_END_MESSAGES.pending);
    if ((await prMergeable(dir, pr.url, deps)) === "CONFLICTING") {
      throw new ApiError(FEATURE_END_MESSAGES.conflicts(look.base));
    }
    const outcome = await mergePr(dir, pr.url, look.tip, deps);
    if (outcome !== null) {
      throw new ApiError("error" in outcome ? outcome.error : FEATURE_END_MESSAGES.conflicts(look.base));
    }
    return settle(dir, id, remote, pr.url);
  }

  /** Runs `work` for feature `id` unless a merge of it already runs. */
  async function once<T>(dir: string, id: string, work: () => Promise<T>): Promise<T> {
    const key = keyOf(dir, id);
    if (merging.has(key)) throw new ApiError(FEATURE_END_MESSAGES.merging(id));
    merging.add(key);
    try {
      return await work();
    } finally {
      merging.delete(key);
    }
  }

  return {
    /** Merges feature `id` to the base, once nothing stops it: on GitHub when it is usable here, else with git. */
    merge: (dir: string, id: string): Promise<{ remains: string[] }> =>
      once(dir, id, async () => {
        const state = await deps.check(dir, await ready(dir, id));
        if (!state.mergeable) throw new ApiError(state.blocked ?? MERGE_NOTES.failed);
        return (await deps.github(dir)) ? mergeOnGithub(dir, id) : mergeLocally(dir, id);
      }),

    /** Feature `id`'s PR was merged on GitHub outside Featra: it settles as a merge Featra made does. */
    async merged(dir: string, id: string, url: string): Promise<string[]> {
      if (merging.has(keyOf(dir, id))) return [];
      const remote = await githubRemote(dir, deps.gitCommand);
      if (!remote) return [];
      return (await once(dir, id, () => settle(dir, id, remote, url))).remains;
    },

    /** Whether feature `id` is merging now. */
    isMerging: (dir: string, id: string) => merging.has(keyOf(dir, id)),
  };
}

export type FeatureMerge = ReturnType<typeof createFeatureMerge>;
