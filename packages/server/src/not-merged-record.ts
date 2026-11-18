/** Recording an automatic merge that didn't happen (STORY-60) on the story's owner copy, by `system`, in the card lane. */
import { isMerged, notMergedStory, serializeCard, toIso } from "@featra/work-format";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import type { EvidenceDeps } from "./check-evidence.ts";

/** Where an automatic merge was tried: the story's commit and, for a conflict, the feature branch's tip. */
export interface TriedAt {
  head: string;
  tip?: string;
}

/** Records that story `id` didn't merge on its own at `tried`, and why; nothing once it is merged or gone. */
export const recordNotMerged = (
  { scan, lane, now }: EvidenceDeps,
  dir: string,
  id: string,
  tried: TriedAt,
  reason: string,
): Promise<void> =>
  lane.exclusive(async () => {
    const found = ownedIn(await scan(dir), id);
    if (!found?.root || isMerged(found.owned.card)) return;
    const next = notMergedStory(found.owned.card, tried.head, reason, "system", toIso(now()), tried.tip);
    await writeAtomic(fileIn(found.root, found.owned.path), serializeCard(next));
  });
