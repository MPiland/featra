/**
 * Holding a story back from auto-merge (STORY-61, ADR 0034): the user's toggle, with no confirmation, so it works from
 * any client. Each turn of it is a `held` event in the card's history, written to the owner copy in the card lane. The
 * scan after the write tells the watchers, auto-merge among them: a story let go that is already Verified and Proven is
 * back among the stories it picks, so it is looked at again and merges.
 */
import { heldStory, HOLD_MESSAGES, holdRefusal, serializeCard, toIso } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import type { Scan } from "./work-scan.ts";

export interface StoryHoldDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The lane every card write goes through; the server shares one. */
  lane?: CardLane;
}

export function createStoryHold({ scan: scanDir, now, lane = createCardLane() }: StoryHoldDeps) {
  return {
    /** Holds story `id` (`held`) or lets it go; nothing is written when it already is. */
    hold: (dir: string, id: string, held: boolean): Promise<null> =>
      lane.exclusive(async () => {
        const scan = await scanDir(dir);
        const found = ownedIn(scan, id);
        const root = found?.root ?? null;
        const refusal = scan ? holdRefusal(found?.owned, id, scan.collected.config, root !== null) : HOLD_MESSAGES.gone;
        if (refusal !== null) throw new ApiError(refusal);
        if (!found || root === null) throw new ApiError(HOLD_MESSAGES.readOnly);
        const card = found.owned.card;
        const next = heldStory(card, held, "user", toIso(now()));
        if (next === card) return null;
        await writeAtomic(fileIn(root, found.owned.path), serializeCard(next));
        // The scan after the write pushes the new row to every watcher.
        await scanDir(dir);
        return null;
      }),
  };
}

export type StoryHold = ReturnType<typeof createStoryHold>;
