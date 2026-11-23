/**
 * The user's Accept and Approve of a feature (STORY-14, STORY-70, ADR 0037). Accept records `accepted` on the feature
 * branch, once every story and bug under it is Done or Cancelled; with "Open feature PRs automatically" on and GitHub
 * usable it opens (or adopts) the feature's PR first. Approve is the review screen's one click: it merges the feature
 * with the Accept carried in the Done card, so nothing is committed to the branch between judging the merge and making
 * it. When the merge doesn't happen, the Accept is recorded on the branch all the same: the user approved, and Merge to
 * main is then the retry.
 */
import {
  featureAcceptRefusal,
  FEATURE_END_MESSAGES,
  serializeCard,
  setPr,
  toIso,
  withFeatureAccepted,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { ownedIn } from "./card-actions.ts";
import type { CardLane } from "./card-lane.ts";
import type { CheckSettings } from "./check-settings.ts";
import { lookAt, writeFeature } from "./feature-look.ts";
import type { FeatureMerge } from "./feature-merge.ts";
import type { FeaturePrs } from "./feature-pr.ts";
import type { MergeGit } from "./merge-git.ts";
import type { Scan } from "./work-scan.ts";

export interface FeatureAcceptDeps {
  scan: (dir: string) => Promise<Scan | null>;
  git: MergeGit;
  lane: CardLane;
  now: () => Date;
  settings: Pick<CheckSettings, "githubUse">;
  prs: Pick<FeaturePrs, "open">;
  merges: Pick<FeatureMerge, "merge" | "isMerging">;
  /** Hears that the user's Approve of a finished feature goes on to its merge. */
  approving: (dir: string, id: string) => void;
  log: (message: string) => void;
}

/** Why feature `id`, in `scan`, can't be accepted; null when it can. */
export function acceptRefusal(scan: Scan | null, id: string): string | null {
  if (!scan) return FEATURE_END_MESSAGES.gone;
  const cards = scan.resolution.cards.map((c) => c.card);
  return featureAcceptRefusal(ownedIn(scan, id)?.owned.card, id, cards, scan.collected.config);
}

export function createFeatureAccept(deps: FeatureAcceptDeps) {
  const { scan: scanDir, git, lane, now, settings, prs, merges, approving, log } = deps;

  /** Records the user's Accept, with the PR at `url` when one just opened, read fresh in the lane. */
  const record = (dir: string, id: string, url: string | null) =>
    lane.exclusive(async () => {
      const fresh = await lookAt(git, await scanDir(dir), id);
      const why = acceptRefusal(fresh?.scan ?? null, id);
      if (why !== null || !fresh) throw new ApiError(why ?? FEATURE_END_MESSAGES.noBranch(id));
      const at = toIso(now());
      const accepted = withFeatureAccepted(fresh.card, "user", at);
      const next = url && !accepted.pr ? setPr(accepted, url, "system", at) : accepted;
      await writeFeature(git, fresh, serializeCard(next), `${id}: accepted`);
    });

  return {
    /** The user's Accept: the feature's PR opens first when that is on, then Accept is recorded with it. */
    async accept(dir: string, id: string): Promise<void> {
      const scan = await scanDir(dir);
      const why = acceptRefusal(scan, id);
      if (why !== null) throw new ApiError(why);
      const look = await lookAt(git, scan, id);
      if (!look) throw new ApiError(FEATURE_END_MESSAGES.noBranch(id));
      const use = (await settings.githubUse(dir)).usable;
      const url = use && look.config.openFeaturePrs && !look.card.pr ? await prs.open(dir, look) : null;
      await record(dir, id, url);
    },

    /** The user's Approve: Accept and Merge to main in one; when the merge fails, the Accept stands and why is thrown. */
    async approve(dir: string, id: string): Promise<{ remains: string[] }> {
      const why = acceptRefusal(await scanDir(dir), id);
      if (why !== null) throw new ApiError(why);
      if (merges.isMerging(dir, id)) throw new ApiError(FEATURE_END_MESSAGES.merging(id));
      approving(dir, id);
      try {
        return await merges.merge(dir, id, true);
      } catch (err) {
        await record(dir, id, null).catch((e: unknown) =>
          log(`${id}'s Accept couldn't be recorded: ${e instanceof Error ? e.message : String(e)}`),
        );
        throw err;
      }
    },
  };
}
