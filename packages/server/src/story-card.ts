/** A story's card as its owner has it in a scan: the card, where to write it, and the tone of its stage. */
import { stageTone } from "@featra/work-format";
import { fileIn, ownedIn } from "./card-actions.ts";
import type { Scan } from "./work-scan.ts";

export function storyCardIn(scan: Scan | null, id: string) {
  const found = ownedIn(scan, id);
  const card = found?.owned.card;
  return {
    card,
    file: found?.root ? fileIn(found.root, found.owned.path) : null,
    tone: card && scan ? stageTone(card.status, scan.collected.config) : ("idle" as const),
  };
}
