/**
 * Merge to main (STORY-14, ADR 0037): an accepted feature merges into the base branch with a merge commit, by the
 * user's click only, once nothing stops it (feature-end.ts). It shares STORY-12's merge path: on GitHub its PR merges
 * with `gh pr merge --merge --match-head-commit` at the commit its checks passed on, and the Done card is then
 * committed onto the base as GitHub has it (merge-settle's `cardOnBranch`); else the merge commit is made by plumbing
 * with the Done card in it and published to the base. The merge goes ahead, in the card lane, only while the feature
 * branch and the base are at the commits its facts were judged at (`Judged`); else it is refused and nothing is done.
 * The user's checkout of the base moves only by fast-forward, which git refuses when a local change is in the way; that
 * is found before anything is done (feature-base.ts). Never squash, rebase or force. Once the base has the feature, its
 * cards are the base's (ADR 0002), and the feature is Done. A PR merged on GitHub outside Featra settles the same way
 * (`settle`), once only, and only when it merged at the commit the branch is at here.
 */
import {
  acceptedFeature,
  doneFeature,
  evidenceState,
  FEATURE_END_MESSAGES,
  GITHUB_COPY,
  mergeCommitMessage,
  mergeStateOf,
  parseCard,
  serializeCard,
  toIso,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { CardLane } from "./card-lane.ts";
import { baseInTheWay } from "./feature-base.ts";
import type { Judged } from "./feature-facts.ts";
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
  /** What the merge waits on, read fresh, and the commits it was judged at. */
  check: (dir: string, look: FeatureLook) => Promise<Judged>;
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
    if (!look) throw new ApiError(FEATURE_END_MESSAGES.noBranch(id));
    if (!acceptedFeature(look.card)) throw new ApiError(FEATURE_END_MESSAGES.notAccepted(id));
    return look;
  }

  /** The feature read fresh in the lane, refused unless its branch is still at the commit it was judged at. */
  async function unmoved(dir: string, id: string, judged: Judged): Promise<FeatureLook> {
    const look = await ready(dir, id);
    if (look.tip !== judged.tip) throw new ApiError(FEATURE_END_MESSAGES.moved(look.branch));
    return look;
  }

  /** Refuses, before anything is done, when the base's checkout has a local change the merge would overwrite. */
  async function baseReady(look: FeatureLook, from: string, to: string[]) {
    if ((await baseInTheWay(git, look, from, to)).length > 0) {
      throw new ApiError(FEATURE_END_MESSAGES.baseBusy(look.base));
    }
  }

  const done = (look: FeatureLook, pr: string | null) =>
    serializeCard(doneFeature(look.card, look.branch, look.base, pr ?? look.card.pr, "system", toIso(now())));

  /** The merge commit into the base, with the Done card in it, made and published in the lane. */
  const mergeLocally = (dir: string, id: string, judged: Judged) =>
    lane.exclusive(async () => {
      const look = await unmoved(dir, id, judged);
      const old = await git.commitOf(look.top, `refs/heads/${look.base}`);
      if (!old) throw new ApiError(MERGE_NOTES.failed);
      if (old !== judged.baseTip) throw new ApiError(FEATURE_END_MESSAGES.moved(look.base));
      if (!(await git.isAncestor(look.top, old, look.tip))) throw new ApiError(FEATURE_END_MESSAGES.behind(look.base));
      await baseReady(look, old, [look.tip]);
      const message = mergeCommitMessage(look.card);
      const made = await git.mergeCommit(look.top, {
        parents: [old, look.tip],
        path: look.path,
        text: done(look, null),
        message,
      });
      if ("conflicts" in made) throw new ApiError(FEATURE_END_MESSAGES.conflicts(look.base));
      if (!(await git.publish(look.top, look.base, made.commit, old))) {
        throw new ApiError(FEATURE_END_MESSAGES.baseBusy(look.base));
      }
      await scanDir(dir);
      return { remains: leftover(look) };
    });

  /** Whether the base as this computer has it has the feature's card Done and merged already. */
  async function settledAlready(look: FeatureLook): Promise<boolean> {
    const shown = await git.git(look.top, ["show", `refs/heads/${look.base}:${look.path}`]);
    if (shown.code !== 0) return false;
    try {
      const card = parseCard(shown.stdout);
      return card.status === "done" && card.history.some((e) => e.field === "merged");
    } catch {
      return false;
    }
  }

  /** The Done card committed onto the base as GitHub has it, after its PR merged there; what stays to do. */
  async function settleNow(dir: string, id: string, remote: GithubRemote, pr: string | null) {
    const look = await lookAt(git, await scanDir(dir), id);
    if (!look || !evidenceState(look.card).accepted || (await settledAlready(look))) return { remains: [] };
    const card = { path: look.path, text: done(look, pr), id };
    const local = await git.commitOf(look.top, `refs/heads/${look.base}`);
    const made = await cardOnBranch(git, look.top, remote.name, look.base, card);
    if (typeof made === "string") {
      const busy = local !== null && (await baseInTheWay(git, look, local, [look.tip])).length > 0;
      return { remains: [busy ? FEATURE_END_MESSAGES.baseBusy(look.base) : made] };
    }
    await scanDir(dir);
    const ahead = made.ahead === null ? [] : [SETTLE_NOTES.ahead(look.base, made.ahead)];
    return { remains: [...ahead, ...leftover(look)] };
  }

  /** The feature's PR merged on GitHub, at the commit its checks passed on, in the lane; what stays to do. */
  const mergeOnGithub = (dir: string, id: string, judged: Judged) =>
    lane.exclusive(async () => {
      const look = await unmoved(dir, id, judged);
      if (!look.card.pr) throw new ApiError(FEATURE_END_MESSAGES.noPr);
      const remote = await githubRemote(dir, deps.gitCommand);
      if (!remote) throw new ApiError(GITHUB_COPY.noRemote);
      const pr = await deps.prs.readNow(dir, id, look.card.pr);
      if (!pr) throw new ApiError(MERGE_NOTES.failed);
      if (pr.status.state === "closed") throw new ApiError(FEATURE_END_MESSAGES.prClosed);
      if (pr.head !== judged.tip) throw new ApiError(FEATURE_END_MESSAGES.moved(look.branch));
      if (pr.status.state === "merged") return settleNow(dir, id, remote, pr.url);
      const local = await git.commitOf(look.top, `refs/heads/${look.base}`);
      if (!local) throw new ApiError(MERGE_NOTES.failed);
      await baseReady(look, local, [judged.tip, ...(judged.baseTip ? [judged.baseTip] : [])]);
      if ((await prMergeable(dir, pr.url, deps)) === "CONFLICTING") {
        throw new ApiError(FEATURE_END_MESSAGES.conflicts(look.base));
      }
      const outcome = await mergePr(dir, pr.url, judged.tip, deps);
      if (outcome !== null) {
        throw new ApiError("error" in outcome ? outcome.error : FEATURE_END_MESSAGES.conflicts(look.base));
      }
      return settleNow(dir, id, remote, pr.url);
    });

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
        const judged = await deps.check(dir, await ready(dir, id));
        const state = mergeStateOf(judged.facts);
        if (!state.mergeable) throw new ApiError(state.blocked ?? MERGE_NOTES.failed);
        return (await deps.github(dir)) ? mergeOnGithub(dir, id, judged) : mergeLocally(dir, id, judged);
      }),

    /** Feature `id`'s PR was merged on GitHub outside Featra, at the commit its branch is at: it settles as Featra's. */
    async merged(dir: string, id: string, url: string): Promise<string[]> {
      if (merging.has(keyOf(dir, id))) return [];
      const remote = await githubRemote(dir, deps.gitCommand);
      if (!remote) return [];
      return (await once(dir, id, () => lane.exclusive(() => settleNow(dir, id, remote, url)))).remains;
    },

    /** Whether feature `id` is merging now. */
    isMerging: (dir: string, id: string) => merging.has(keyOf(dir, id)),
  };
}

export type FeatureMerge = ReturnType<typeof createFeatureMerge>;
