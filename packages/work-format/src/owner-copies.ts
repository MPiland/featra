/**
 * Picks each card's owner copy from every copy the server read (ADR 0002, ADR 0016), and finds edits made to copies
 * that aren't the owner. Pure: the server reads the files and git, this decides.
 */
import { idFromFileName } from "./ids.ts";
import { locationLabel, ownerOf, sameLocation, type BranchState, type OwnerLocation } from "./ownership.ts";
import type { Card } from "./types.ts";
import { assertNever } from "./utils/guards.ts";

/** One file in one location's `.featra/cards/`. */
export interface CardCopy {
  location: OwnerLocation;
  /** The file's path in the repository, `/`-separated (`.featra/cards/STORY-3-….md`). */
  path: string;
  text: string;
  /** The parsed card, or null when the file doesn't parse (see `error`). */
  card: Card | null;
  error: string | null;
  /** True when the file is in a working tree, where it can be edited on disk. */
  workingTree: boolean;
  /** True when the working-tree file differs from the worktree's HEAD, or HEAD has no such file. */
  edited: boolean;
}

/** A card as shown: from its owner, or, when the owner has no copy, from the copy that has it. */
export interface OwnedCard {
  card: Card;
  owner: OwnerLocation;
  /** Where the shown copy is: the owner, unless the owner has none. */
  shownFrom: OwnerLocation;
  path: string;
  /**
   * The owner has a file of this card that can't be read, likely mid-write (BUG-24): the copy shown is for display only.
   * Nothing writes it, and observers keep the card's last real state.
   */
  ownerUnread?: true;
}

/** An uncommitted edit to a copy that isn't the owner's: flagged, never merged on its own. */
export interface StaleCopy {
  cardId: string;
  location: OwnerLocation;
  path: string;
  owner: OwnerLocation;
}

export interface Resolution {
  cards: OwnedCard[];
  stale: StaleCopy[];
  /** Files that can't be shown, in short sentences. */
  problems: string[];
}

const normalized = (text: string) => text.replace(/\r\n/g, "\n");

/** Worktrees first, then feature branches, then main: a copy nearer the work is the likelier owner. */
function rank(loc: OwnerLocation): number {
  switch (loc.kind) {
    case "worktree":
      return 0;
    case "feature":
      return 1;
    case "main":
      return 2;
    default:
      return assertNever(loc);
  }
}

type Parsed = CardCopy & { card: Card };

/**
 * Copies can disagree on a story's parent, and its owner depends on the parent. The owner is the first location, in
 * rank order, that a copy points to and whose own copy agrees with it.
 */
function ownerOfCopies(copies: readonly Parsed[], state: BranchState): OwnerLocation {
  for (const c of copies) {
    const loc = ownerOf(c.card, state);
    const there = copies.find((o) => sameLocation(o.location, loc));
    if (there && there.card.parent === c.card.parent && there.card.type === c.card.type) return loc;
  }
  const fallback = copies.find((c) => c.location.kind === "main") ?? copies[0];
  return fallback ? ownerOf(fallback.card, state) : { kind: "main" };
}

/** Why card `id` can't be acted on while its owner's copy can't be read (BUG-24): the copy shown may be stale. */
export const ownerUnreadReason = (id: string) => `${id} can't be read in its owner now. Try again once it's saved.`;

/** Cards shown from a copy that isn't their owner's: the owner has none. */
export const orphans = (resolution: Resolution): OwnedCard[] =>
  resolution.cards.filter((c) => !sameLocation(c.owner, c.shownFrom));

/**
 * `gone` holds the cards deleted at their owner (STORY-58: an abandoned story's card discarded): older copies elsewhere
 * don't bring them back, so they aren't shown at all. An uncommitted edit to one of those copies is still stale.
 */
export function resolveCopies(
  copies: readonly CardCopy[],
  state: BranchState,
  gone: ReadonlySet<string> = new Set(),
): Resolution {
  const problems: string[] = [];
  const byId = new Map<string, Parsed[]>();
  /** The copies that can't be read, by the card ID their file name gives. */
  const unread = new Map<string, OwnerLocation[]>();
  const ordered = copies.toSorted((a, b) => rank(a.location) - rank(b.location) || a.path.localeCompare(b.path));
  for (const c of ordered) {
    const fileId = idFromFileName(c.path.split("/").at(-1) ?? "");
    if (!c.card) {
      if (c.workingTree) problems.push(`Can't read ${c.path} in ${locationLabel(c.location)}: ${c.error ?? ""}`);
      if (fileId) unread.set(fileId, [...(unread.get(fileId) ?? []), c.location]);
      continue;
    }
    if (fileId && fileId !== c.card.id && c.workingTree) {
      problems.push(`${c.path} in ${locationLabel(c.location)} holds ${c.card.id}.`);
    }
    const group = byId.get(c.card.id) ?? [];
    if (group.some((g) => sameLocation(g.location, c.location))) {
      problems.push(`${c.card.id} is in two files in ${locationLabel(c.location)}; showing the first.`);
      continue;
    }
    group.push({ ...c, card: c.card });
    byId.set(c.card.id, group);
  }

  const cards: OwnedCard[] = [];
  const stale: StaleCopy[] = [];
  for (const [id, group] of byId) {
    const owner = ownerOfCopies(group, state);
    if (gone.has(id)) {
      // Not shown, but an uncommitted edit to it elsewhere is still flagged, never dropped silently.
      for (const c of group)
        if (c.workingTree && c.edited) stale.push({ cardId: id, location: c.location, path: c.path, owner });
      continue;
    }
    const own = group.find((c) => sameLocation(c.location, owner));
    const shown = own ?? group[0];
    if (!shown) continue;
    // An owner whose file can't be read is likely mid-write (BUG-24): the card shows from the copy nearest the work.
    const ownerUnread = !own && (unread.get(id)?.some((l) => sameLocation(l, owner)) ?? false);
    if (!own) {
      const why = ownerUnread ? "can't be read in" : "isn't in";
      problems.push(`${id} ${why} its owner (${locationLabel(owner)}); showing ${locationLabel(shown.location)}.`);
    }
    cards.push({
      card: shown.card,
      owner,
      shownFrom: shown.location,
      path: shown.path,
      ...(ownerUnread ? { ownerUnread: true as const } : {}),
    });
    for (const c of group) {
      if (c === own || !c.workingTree || !c.edited) continue;
      if (own && normalized(own.text) === normalized(c.text)) continue;
      stale.push({ cardId: id, location: c.location, path: c.path, owner });
    }
  }
  return { cards, stale, problems };
}
