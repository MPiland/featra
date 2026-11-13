/** Recording a story's PR on its owner copy (STORY-11), by `system`, read fresh in the card lane. */
import { serializeCard, setPr, toIso } from "@featra/work-format";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import type { EvidenceDeps } from "./check-evidence.ts";

/** Records `url` as story `id`'s PR, unless someone set another `pr` there meanwhile: theirs stands. */
export const recordPr = ({ scan, lane, now }: EvidenceDeps, dir: string, id: string, url: string) =>
  lane.exclusive(async () => {
    const found = ownedIn(await scan(dir), id);
    if (!found?.root || (found.owned.card.pr && found.owned.card.pr !== url)) return;
    const next = setPr(found.owned.card, url, "system", toIso(now()));
    if (next !== found.owned.card) await writeAtomic(fileIn(found.root, found.owned.path), serializeCard(next));
  });
