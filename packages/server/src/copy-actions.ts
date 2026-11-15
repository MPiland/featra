/**
 * What the user can do with a stale copy (ADR 0016): apply its edit to the owner's card, or discard it. Both run in
 * the card lane, rescan first and act only on a copy that is still stale. Apply works out the owner's new card before
 * writing anything, so a refusal leaves every file as it was; then it writes the owner atomically, puts the stale copy
 * back as git has it, and scans again so watchers hear the change.
 */
import {
  applyCopyEdit,
  copyKey,
  errorMessage,
  locationLabel,
  parseCard,
  sameLocation,
  serializeCard,
  toIso,
  type Card,
  type CopyActionResult,
} from "@featra/work-format";
import { fileIn, writeAtomic, type AtomicIo } from "./card-actions.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import { locationKey, unreadableIn } from "./collect.ts";
import type { RepoGit } from "./repo-git.ts";
import type { Scan } from "./work-scan.ts";

export interface CopyActionDeps {
  git: RepoGit;
  /** Scans a folder; the server passes the watches' scan, so one scan before and one after also push (BUG-6). */
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The lane every card write goes through; the server shares one (BUG-24). */
  lane?: CardLane;
  /** The disk under the owner's atomic write, for tests to watch it. */
  io?: AtomicIo;
}

function findStale(scan: Scan | null, key: string) {
  const stale = scan?.resolution.stale.find((s) => copyKey(s.location, s.path) === key);
  if (!scan || !stale) return null;
  const copy = scan.collected.copies.find((c) => sameLocation(c.location, stale.location) && c.path === stale.path);
  const root = scan.collected.roots.get(locationKey(stale.location));
  return copy?.card && root ? { scan, stale, copy: { ...copy, card: copy.card }, root } : null;
}

const GONE: CopyActionResult = { ok: false, error: "That copy has no changes now." };
const UNREAD: CopyActionResult = { ok: false, error: "The owner's copy can't be read. Fix it first." };

export function createCopyActions({ git, scan: scanDir, now, lane = createCardLane(), io }: CopyActionDeps) {
  const restore = (scan: Scan, root: string, location: Parameters<typeof copyKey>[0], path: string) =>
    git.restore(root, path, scan.collected.headTexts.get(copyKey(location, path)) != null);

  async function apply(dir: string, key: string): Promise<CopyActionResult> {
    const found = findStale(await scanDir(dir), key);
    if (!found) return GONE;
    const { scan, stale, copy, root } = found;
    const ownerRoot = scan.collected.roots.get(locationKey(stale.owner));
    if (!ownerRoot) {
      return { ok: false, error: `The owner, ${locationLabel(stale.owner)}, isn't checked out. Check it out first.` };
    }
    const ownerCopy = scan.resolution.cards.find(
      (c) => c.card.id === stale.cardId && sameLocation(c.shownFrom, stale.owner),
    );
    // An owner file that can't be read may be mid-write (BUG-24): writing over it would lose that write.
    if (!ownerCopy && unreadableIn(scan.collected.copies, stale.owner, stale.cardId)) return UNREAD;
    let base: Card | null = null;
    const committed = scan.collected.headTexts.get(key);
    try {
      if (committed != null) base = parseCard(committed, stale.path);
    } catch {
      base = null;
    }
    const result = applyCopyEdit(base, copy.card, ownerCopy?.card ?? null, "user", toIso(now()));
    if (!result.ok) return result;
    try {
      await writeAtomic(fileIn(ownerRoot, ownerCopy?.path ?? stale.path), serializeCard(result.card), io);
      await restore(scan, root, stale.location, stale.path);
    } catch (err) {
      return { ok: false, error: `Can't apply the copy: ${errorMessage(err)}` };
    }
    await scanDir(dir);
    return { ok: true };
  }

  async function discard(dir: string, key: string): Promise<CopyActionResult> {
    const found = findStale(await scanDir(dir), key);
    if (!found) return GONE;
    try {
      await restore(found.scan, found.root, found.stale.location, found.stale.path);
    } catch (err) {
      return { ok: false, error: `Can't discard the copy: ${errorMessage(err)}` };
    }
    await scanDir(dir);
    return { ok: true };
  }

  return {
    apply: (dir: string, key: string) => lane.exclusive(() => apply(dir, key)),
    discard: (dir: string, key: string) => lane.exclusive(() => discard(dir, key)),
  };
}

export type CopyActions = ReturnType<typeof createCopyActions>;
