/**
 * The one path check evidence takes to a card (ADR 0004): local runs (STORY-56) and a PR's CI checks (STORY-11) both
 * write it here, on the story's owner copy, by `system`, read fresh inside the card lane.
 */
import { checksApply, serializeCard, toIso, withCheckEvidence, type CheckOutcome } from "@featra/work-format";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import type { CardLane } from "./card-lane.ts";
import type { Scan } from "./work-scan.ts";

export interface EvidenceDeps {
  scan: (dir: string) => Promise<Scan | null>;
  lane: CardLane;
  now: () => Date;
}

/** Records `outcome` on story `id`; false when the story isn't in review (or isn't there), and nothing is written. */
export function recordEvidence({ scan, lane, now }: EvidenceDeps, dir: string, id: string, outcome: CheckOutcome) {
  return lane.exclusive(async () => {
    const current = await scan(dir);
    const found = ownedIn(current, id);
    const config = current?.collected.config;
    if (!found?.root || !config || !checksApply(found.owned.card, config)) return false;
    const next = withCheckEvidence(found.owned.card, config, outcome, "system", toIso(now()));
    if (next !== found.owned.card) await writeAtomic(fileIn(found.root, found.owned.path), serializeCard(next));
    return true;
  });
}
