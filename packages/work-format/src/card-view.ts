/**
 * A card as the card pane shows it (ADR 0017): its text, evidence marks, each AC's proof, and the status and parent
 * moves the rules allow. Pure: built from the owner copies the server resolved.
 */
import { awaitingAcceptance } from "./acceptance.ts";
import { isMerged } from "./history.ts";
import { mergeRefusal } from "./merge.ts";
import { abandonRefusal } from "./abandon.ts";
import { parentChoices, statusChoices, type CardEditContext } from "./card-edit.ts";
import type { AcProof, CardView } from "./card-view-types.ts";
import type { CardChecks } from "./checks-types.ts";
import type { CardPr } from "./prs-types.ts";
import { draftedBy, needsReview } from "./card-draft-guard.ts";
import { notStartableReason } from "./card-start.ts";
import { evidenceState } from "./evidence.ts";
import type { FeatureMergeState } from "./feature-end-copy.ts";
import { featureEndOf } from "./feature-end.ts";
import { locationLabel, sameLocation } from "./ownership.ts";
import type { OwnedCard } from "./owner-copies.ts";
import { CANCELLED, type Card } from "./types.ts";

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

/** Each AC's proof: from its evidence, then the last local run (STORY-56) or CI's report (STORY-57) that didn't prove it. */
function proofOf(card: Card, provenAcs: readonly number[], checks?: CardChecks, prState?: CardPr) {
  const failed = new Set([...(checks?.failedAcs ?? []), ...(prState?.report?.failedAcs ?? [])]);
  const missing = new Set(prState?.report?.missingAcs ?? []);
  return (index: number): AcProof => {
    if (provenAcs.includes(index + 1)) return "passed";
    if (failed.has(index + 1)) return "failed";
    if (missing.has(index + 1)) return "missing";
    return card.acs[index]?.test ? "linked" : "none";
  };
}

/** A feature's stories in order, without the Cancelled ones. */
const storiesOf = (card: Card, cards: readonly Card[]) =>
  card.type !== "feature"
    ? []
    : cards
        .filter((c) => c.type === "story" && c.parent === card.id && c.status !== CANCELLED)
        .toSorted((a, b) => a.order - b.order || a.id.localeCompare(b.id, undefined, { numeric: true }))
        .map((c) => ({ id: c.id, title: c.title, status: c.status }));

/**
 * The pane's view of `owned`; `checkedOut` says whether the owner's location has a working tree. `checks` is what the
 * server knows of the story's checks on this computer (STORY-56), which the card itself doesn't keep; `prState` what it
 * knows of the story's PR (STORY-11), or the feature's; `merge` whether an accepted feature can merge to main (STORY-14).
 */
export function buildCardView(
  owned: OwnedCard,
  checkedOut: boolean,
  ctx: CardEditContext,
  checks?: CardChecks,
  prState?: CardPr,
  merge?: FeatureMergeState,
): CardView {
  const { card } = owned;
  const ev = evidenceState(card);
  const proof = proofOf(card, ev.provenAcs, checks, prState);
  const draftChat = card.type === "feature" && needsReview(card) ? draftedBy(card) : null;
  const readOnly = readOnlyReason(owned, checkedOut, ctx.config.baseBranch);
  const featureEnd = featureEndOf(card, ctx.cards, ctx.config, merge);
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
    stories: storiesOf(card, ctx.cards),
    owner: locationLabel(owned.owner),
    readOnly,
    ...(checks ? { checks } : {}),
    ...(prState ? { prState } : {}),
    ...(awaitingAcceptance(card, ctx.config) ? { awaiting: true as const } : {}),
    ...(notStartableReason(card, card.id) === null ? { startable: true as const } : {}),
    ...(mergeRefusal(owned, card.id, ctx.config, readOnly === null) === null ? { mergeable: true as const } : {}),
    ...(abandonRefusal(owned, card.id, ctx.config, readOnly === null) === null ? { abandonable: true as const } : {}),
    ...(isMerged(card) && card.type === "story" ? { merged: true as const } : {}),
    ...(featureEnd ? { featureEnd } : {}),
    ...(draftChat === null
      ? {}
      : { draftChat, draftStories: ctx.cards.filter((c) => c.type === "story" && c.parent === card.id).length }),
  };
}
