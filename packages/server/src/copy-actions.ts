/**
 * What the user can do with a stale copy (ADR 0016): apply its edit to the owner's card, or discard it. Both rescan
 * first and act only on a copy that is still stale. Apply works out the owner's new card before writing anything,
 * so a refusal leaves every file as it was; then it writes the owner and puts the stale copy back as git has it.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
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
import { locationKey } from "./collect.ts";
import type { RepoGit } from "./repo-git.ts";
import type { Scan, Scanner } from "./work-scan.ts";

export interface CopyActionDeps {
  git: RepoGit;
  scanner: Scanner;
  now: () => Date;
}

const fileIn = (root: string, path: string) => join(root, ...path.split("/"));

function findStale(scan: Scan | null, key: string) {
  const stale = scan?.resolution.stale.find((s) => copyKey(s.location, s.path) === key);
  if (!scan || !stale) return null;
  const copy = scan.collected.copies.find((c) => sameLocation(c.location, stale.location) && c.path === stale.path);
  const root = scan.collected.roots.get(locationKey(stale.location));
  return copy?.card && root ? { scan, stale, copy: { ...copy, card: copy.card }, root } : null;
}

const GONE: CopyActionResult = { ok: false, error: "That copy has no changes now." };

export function createCopyActions({ git, scanner, now }: CopyActionDeps) {
  const restore = (scan: Scan, root: string, location: Parameters<typeof copyKey>[0], path: string) =>
    git.restore(root, path, scan.collected.headTexts.get(copyKey(location, path)) != null);

  return {
    async apply(dir: string, key: string): Promise<CopyActionResult> {
      const found = findStale(await scanner.scan(dir), key);
      if (!found) return GONE;
      const { scan, stale, copy, root } = found;
      const ownerRoot = scan.collected.roots.get(locationKey(stale.owner));
      if (!ownerRoot) {
        return { ok: false, error: `The owner, ${locationLabel(stale.owner)}, isn't checked out. Check it out first.` };
      }
      const ownerCopy = scan.resolution.cards.find(
        (c) => c.card.id === stale.cardId && sameLocation(c.shownFrom, stale.owner),
      );
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
        await writeFile(fileIn(ownerRoot, ownerCopy?.path ?? stale.path), serializeCard(result.card), "utf8");
        await restore(scan, root, stale.location, stale.path);
      } catch (err) {
        return { ok: false, error: `Can't apply the copy: ${errorMessage(err)}` };
      }
      return { ok: true };
    },

    async discard(dir: string, key: string): Promise<CopyActionResult> {
      const found = findStale(await scanner.scan(dir), key);
      if (!found) return GONE;
      try {
        await restore(found.scan, found.root, found.stale.location, found.stale.path);
      } catch (err) {
        return { ok: false, error: `Can't discard the copy: ${errorMessage(err)}` };
      }
      return { ok: true };
    },
  };
}

export type CopyActions = ReturnType<typeof createCopyActions>;
