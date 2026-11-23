/**
 * The finished features a project's scan has (STORY-14, STORY-70): accepted, or ones Approve could take. Their facts
 * are read again when what makes them worth reading changes.
 */
import { acceptedFeature, finishedFeature, type FeatureMergeFacts } from "@featra/work-format";
import { locationKey } from "./collect.ts";
import { acceptRefusal } from "./feature-accept.ts";
import type { FeatureLook } from "./feature-look.ts";
import type { Scan } from "./work-scan.ts";

/** A finished feature as the scan has it: what makes its facts worth reading again when it changes. */
export interface Seen {
  id: string;
  accepted: boolean;
  pr: string | null;
  head: string | null;
}

/** The finished features in `scan`, and the commit the base is at. */
export function seenOf(scan: Scan | null): { minutes: number; base: string | null; features: Seen[] } {
  if (!scan) return { minutes: 2, base: null, features: [] };
  const { heads, state, config } = scan.collected;
  const cards = scan.resolution.cards.map((c) => c.card);
  const features = cards.flatMap((card) => {
    const branch = state.features[card.id]?.branch;
    if (!branch || !finishedFeature(card, cards, config)) return [];
    const head = heads.get(locationKey({ kind: "feature", branch })) ?? null;
    return [{ id: card.id, accepted: acceptedFeature(card), pr: card.pr, head }];
  });
  return { minutes: config.prRefreshMinutes, base: heads.get(locationKey({ kind: "main" })) ?? null, features };
}

/** Why feature `look` can't open its PR or run its checks: it isn't finished. Null when it is. */
export const unfinished = (look: FeatureLook): string | null =>
  acceptedFeature(look.card) ? null : acceptRefusal(look.scan, look.card.id);

/** Facts of a feature whose PR merged on GitHub without the commit its branch is at here: it waits, saying so. */
export const mergedBehind = (look: FeatureLook): FeatureMergeFacts => ({
  base: look.base,
  branch: look.branch,
  behind: false,
  conflicts: false,
  pr: "merged",
  remoteAhead: false,
  baseBusy: false,
  checks: "pending",
});
