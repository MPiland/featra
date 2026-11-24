/**
 * The user's Approve of a feature (STORY-70, ADR 0037): the review screen's one click that accepts and merges, once
 * every story and bug under it is Done or Cancelled. It merges the feature with the Accept carried in the Done card, so
 * nothing is committed to the branch between judging the merge and making it; the Approve is kept (feature-approvals)
 * until the merge settles. When the merge doesn't happen, the Accept is recorded on the branch all the same: the user
 * approved, and Merge to main is then the retry.
 */
import {
  featureAcceptRefusal,
  FEATURE_END_MESSAGES,
  serializeCard,
  toIso,
  withFeatureAccepted,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { ownedIn } from "./card-actions.ts";
import type { CardLane } from "./card-lane.ts";
import { lookAt, writeFeature } from "./feature-look.ts";
import type { FeatureMerge } from "./feature-merge.ts";
import type { MergeGit } from "./merge-git.ts";
import type { Scan } from "./work-scan.ts";

export interface FeatureAcceptDeps {
  scan: (dir: string) => Promise<Scan | null>;
  git: MergeGit;
  lane: CardLane;
  now: () => Date;
  merges: Pick<FeatureMerge, "merge" | "isMerging">;
  /** Keeps the user's Approve of a finished feature, before it goes on to its merge. */
  approving: (dir: string, scan: Scan, id: string) => Promise<void>;
  log: (message: string) => void;
}

/** Why feature `id`, in `scan`, can't be accepted; null when it can. */
export function acceptRefusal(scan: Scan | null, id: string): string | null {
  if (!scan) return FEATURE_END_MESSAGES.gone;
  const cards = scan.resolution.cards.map((c) => c.card);
  return featureAcceptRefusal(ownedIn(scan, id)?.owned.card, id, cards, scan.collected.config);
}

export function createFeatureAccept(deps: FeatureAcceptDeps) {
  const { scan: scanDir, git, lane, now, merges, approving, log } = deps;

  /** Records the user's Accept on the feature branch, read fresh in the lane. */
  const record = (dir: string, id: string) =>
    lane.exclusive(async () => {
      const fresh = await lookAt(git, await scanDir(dir), id);
      const why = acceptRefusal(fresh?.scan ?? null, id);
      if (why !== null || !fresh) throw new ApiError(why ?? FEATURE_END_MESSAGES.noBranch(id));
      const accepted = withFeatureAccepted(fresh.card, "user", toIso(now()));
      await writeFeature(git, fresh, serializeCard(accepted), `${id}: accepted`);
    });

  return {
    /** The user's Approve: Accept and Merge to main in one; when the merge fails, the Accept stands and why is thrown. */
    async approve(dir: string, id: string): Promise<{ remains: string[] }> {
      const scan = await scanDir(dir);
      const why = acceptRefusal(scan, id);
      if (why !== null || !scan) throw new ApiError(why ?? FEATURE_END_MESSAGES.gone);
      if (merges.isMerging(dir, id)) throw new ApiError(FEATURE_END_MESSAGES.merging(id));
      await approving(dir, scan, id);
      try {
        return await merges.merge(dir, id, true);
      } catch (err) {
        await record(dir, id).catch((e: unknown) =>
          log(`${id}'s Accept couldn't be recorded: ${e instanceof Error ? e.message : String(e)}`),
        );
        throw err;
      }
    },
  };
}
