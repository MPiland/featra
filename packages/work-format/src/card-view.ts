/**
 * A card as the card pane shows it (ADR 0017): its text, evidence marks, each AC's proof, and the status and parent
 * moves the rules allow. Pure: built from the owner copies the server resolved.
 */
import { parentChoices, statusChoices, type CardEditContext } from "./card-edit.ts";
import type { AcProof, CardView } from "./card-view-types.ts";
import { evidenceState } from "./evidence.ts";
import { locationLabel, sameLocation } from "./ownership.ts";
import type { OwnedCard } from "./owner-copies.ts";
import type { Card } from "./types.ts";

/**
 * Why the card can't be edited, or null when it can. Edits go to the owner's copy only (ADR 0002), on disk, so the
 * owner must have a copy and be checked out in a working tree.
 */
export function readOnlyReason(owned: OwnedCard, checkedOut: boolean, baseBranch: string): string | null {
  if (!sameLocation(owned.shownFrom, owned.owner)) return `Its owner, ${locationLabel(owned.owner)}, has no copy.`;
  if (checkedOut) return null;
  const branch = owned.owner.kind === "main" ? baseBranch : owned.owner.branch;
  return `Check out ${branch} to edit it.`;
}

function proofOf(card: Card, provenAcs: readonly number[]) {
  return (index: number): AcProof => {
    if (provenAcs.includes(index + 1)) return "passed";
    return card.acs[index]?.test ? "linked" : "none";
  };
}

/** The pane's view of `owned`; `checkedOut` says whether the owner's location has a working tree. */
export function buildCardView(owned: OwnedCard, checkedOut: boolean, ctx: CardEditContext): CardView {
  const { card } = owned;
  const ev = evidenceState(card);
  const proof = proofOf(card, ev.provenAcs);
  return {
    id: card.id,
    type: card.type,
    title: card.title,
    status: card.status,
    statusOptions: statusChoices(card, ctx),
    parent: card.parent,
    parentOptions: parentChoices(card, ctx),
    description: card.description,
    evidence: { reported: ev.reported, verified: ev.verified, proven: ev.proven, accepted: ev.accepted },
    acs: card.acs.map((ac, i) => ({ text: ac.text, done: ac.done, test: ac.test, proof: proof(i) })),
    tasks: card.tasks.map((t) => ({ text: t.text, done: t.done })),
    notes: card.notes,
    pr: card.pr,
    owner: locationLabel(owned.owner),
    readOnly: readOnlyReason(owned, checkedOut, ctx.config.baseBranch),
  };
}
