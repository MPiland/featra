/**
 * The card pane's reads and writes (ADR 0017). A card is read from its owner copy, as the Work list resolved it, and
 * an edit is written to that copy only: never to a stale copy, and never to a location that isn't checked out. The
 * edit itself is work-format's `applyCardEdit`; the write is atomic (a temporary file, then a rename).
 */
import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  applyCardEdit,
  buildCardView,
  errorMessage,
  serializeCard,
  toIso,
  type CardEdit,
  type CardEditContext,
  type CardUpdateResult,
  type CardView,
} from "@featra/work-format";
import { createCardLane, type CardLane } from "./card-lane.ts";
import { locationKey } from "./collect.ts";
import type { Scan } from "./work-scan.ts";

export interface CardActionDeps {
  /**
   * Scans a folder, before the edit and again after the write. The server passes the watches' scan, so the scan
   * after also pushes to every watcher, and neither runs git unless git changed (BUG-6).
   */
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The lane every card write goes through, shared with the draft writer so a draft and an edit never interleave. */
  lane?: CardLane;
}

const contextOf = (scan: Scan): CardEditContext => ({
  config: scan.collected.config,
  cards: scan.resolution.cards.map((c) => c.card),
});

function ownedIn(scan: Scan | null, id: string) {
  const owned = scan?.resolution.cards.find((c) => c.card.id === id);
  if (!scan || !owned) return null;
  return { owned, root: scan.collected.roots.get(locationKey(owned.owner)) ?? null };
}

/** The pane's view of card `id` in `scan`, or null when there is no such card. */
export function cardViewIn(scan: Scan | null, id: string): CardView | null {
  const found = ownedIn(scan, id);
  return scan && found ? buildCardView(found.owned, found.root !== null, contextOf(scan)) : null;
}

/** Writes `text` to `file` through a temporary file in the same folder, so no reader sees half a card. */
export async function writeAtomic(file: string, text: string): Promise<void> {
  const temp = join(dirname(file), `.${randomBytes(6).toString("hex")}.featra-tmp`);
  try {
    await writeFile(temp, text, "utf8");
    await rename(temp, file);
  } catch (err) {
    await rm(temp, { force: true });
    throw err;
  }
}

const fileIn = (root: string, path: string) => join(root, ...path.split("/"));

export function createCardActions({ scan: scanDir, now, lane = createCardLane() }: CardActionDeps) {
  async function apply(dir: string, id: string, edit: CardEdit): Promise<CardUpdateResult> {
    const scan = await scanDir(dir);
    const found = ownedIn(scan, id);
    const view = cardViewIn(scan, id);
    if (!scan || !found || !view) return { ok: false, error: "That card is gone.", view: null };
    if (view.readOnly || !found.root) return { ok: false, error: view.readOnly ?? "Can't edit it here.", view };
    const result = applyCardEdit(found.owned.card, edit, contextOf(scan), "user", toIso(now()));
    if (!result.ok) return { ...result, view };
    if (result.card === found.owned.card) return { ok: true, view };
    try {
      await writeAtomic(fileIn(found.root, found.owned.path), serializeCard(result.card));
    } catch (err) {
      return { ok: false, error: `Can't save the card: ${errorMessage(err)}`, view };
    }
    const after = cardViewIn(await scanDir(dir), id);
    return after ? { ok: true, view: after } : { ok: false, error: "That card is gone.", view: null };
  }

  return {
    /** Applies `edit` to the owner's copy of `id`, read fresh; answers with the view as it is after. */
    update: (dir: string, id: string, edit: CardEdit): Promise<CardUpdateResult> =>
      lane.exclusive(() => apply(dir, id, edit)),
  };
}

export type CardActions = ReturnType<typeof createCardActions>;
