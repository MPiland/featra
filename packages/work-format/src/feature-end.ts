/**
 * Ending a feature (STORY-14, STORY-70, ADR 0037): pure rules over its card. Approve applies to a feature in progress
 * once every story and bug under it is Done or Cancelled, and it is the user's alone: it records Accept, a fact in the
 * card's history as for a story, and merges. Merge to main, the retry once accepted, waits for the same: the stories,
 * the feature's checks on the commit its branch is at, and main in that commit's history without conflicts. Only the
 * merge makes the feature Done, by `system`, with the merge in its history.
 */
import { stageCategory } from "./config.ts";
import { evidenceState } from "./evidence.ts";
import { FEATURE_END_MESSAGES, type FeatureApproval, type FeatureMergeState } from "./feature-end-copy.ts";
import { appendHistory, recordAcceptance, setPr, setStatus } from "./history.ts";
import { CANCELLED, type Card, type ProjectConfig } from "./types.ts";

/** The stories and bugs under feature `id`. */
const itemsOf = (id: string, cards: readonly Card[]) =>
  cards.filter((c) => (c.type === "story" || c.type === "bug") && c.parent === id);

/**
 * Why feature `id` isn't finished: a story or bug under it isn't Done or Cancelled, or none is Done. Null once it is.
 * Approve and Merge to main both wait for it, first (ADR 0037).
 */
export function featureItemsRefusal(id: string, cards: readonly Card[], config: ProjectConfig): string | null {
  const items = itemsOf(id, cards);
  const done = items.filter((c) => stageCategory(c.status, config) === "done");
  const open = items.filter((c) => c.status !== CANCELLED && stageCategory(c.status, config) !== "done");
  if (open.length > 0) return FEATURE_END_MESSAGES.unfinished(id, open.length);
  return done.length === 0 ? FEATURE_END_MESSAGES.empty(id) : null;
}

/** Why feature `id` can't be accepted, or null when it can. */
export function featureAcceptRefusal(
  card: Card | undefined,
  id: string,
  cards: readonly Card[],
  config: ProjectConfig,
): string | null {
  if (!card) return FEATURE_END_MESSAGES.gone;
  if (card.type !== "feature") return FEATURE_END_MESSAGES.notFeature(id);
  if (card.status !== "active") return FEATURE_END_MESSAGES.notActive(id);
  if (evidenceState(card).accepted) return FEATURE_END_MESSAGES.accepted(id);
  return featureItemsRefusal(card.id, cards, config);
}

/** Whether `card` is a feature in progress that the user has accepted: what Merge to main and its checks wait for. */
export const acceptedFeature = (card: Card): boolean =>
  card.type === "feature" && card.status === "active" && evidenceState(card).accepted;

/** The feature with the user's Accept recorded, once. */
export const withFeatureAccepted = (card: Card, by: string, at: string): Card =>
  evidenceState(card).accepted ? card : recordAcceptance(card, true, by, at);

/** The feature as merged: Done, its merge from `from` into `into` in its history, and its PR, when it had one. */
export function doneFeature(card: Card, from: string, into: string, pr: string | null, by: string, at: string): Card {
  const merged = card.history.some((e) => e.field === "merged")
    ? card
    : appendHistory(card, { at, field: "merged", from, to: into, by });
  const withPr = pr ? setPr(merged, pr, by, at) : merged;
  return setStatus(withPr, "done", by, at);
}

/** Where a feature's checks stand for the commit its branch is at. */
export type FeatureChecks = "passed" | "failed" | "running" | "pending" | "no-command";

/** What the server found of a finished feature, which Approve and Merge to main wait on. */
export interface FeatureMergeFacts {
  base: string;
  branch: string;
  /** The base's tip isn't in the feature branch's history. */
  behind: boolean;
  /** Merging the feature into the base conflicts. */
  conflicts: boolean;
  /**
   * Its PR on GitHub: none yet, open, closed, merged there without the commit the local branch is at, or `landed`:
   * merged at that commit, and not settled yet (Featra settles it once the user approved it). Null in local mode.
   */
  pr: "none" | "open" | "closed" | "merged" | "landed" | null;
  /** The feature branch on GitHub has commits the local one doesn't. */
  remoteAhead: boolean;
  /** The base's checkout has local changes the merge would overwrite, so it can't take the merge. */
  baseBusy: boolean;
  checks: FeatureChecks;
}

/** Why Merge to main waits, or null when it can go. */
export function featureMergeBlock(f: FeatureMergeFacts): string | null {
  const m = FEATURE_END_MESSAGES;
  // Merged on GitHub at the branch's commit: nothing else counts, the click only settles it.
  if (f.pr === "landed") return null;
  if (f.pr === "merged") return m.prMergedBehind;
  if (f.conflicts) return m.conflicts(f.base);
  if (f.behind) return m.behind(f.base);
  if (f.pr === "none") return m.noPr;
  if (f.pr === "closed") return m.prClosed;
  if (f.remoteAhead) return m.remoteAhead(f.branch);
  if (f.baseBusy) return m.baseBusy(f.base);
  if (f.checks === "passed") return null;
  if (f.checks === "no-command") return m.noCommand;
  return f.checks === "running" ? m.running : f.checks === "failed" ? m.failed : m.pending;
}

export const mergeStateOf = (facts: FeatureMergeFacts): FeatureMergeState => {
  const blocked = featureMergeBlock(facts);
  return { mergeable: blocked === null, blocked, ...(facts.pr === "landed" ? { landed: true as const } : {}) };
};

/** Whether `card` is a feature in progress that the user accepted or could approve now: the server reads its merge. */
export const finishedFeature = (card: Card, cards: readonly Card[], config: ProjectConfig): boolean =>
  acceptedFeature(card) || featureAcceptRefusal(card, card.id, cards, config) === null;

/**
 * The review screen's Approve (STORY-70): one click that accepts and merges; once accepted without the merge, Merge to
 * main again; once merged, Merged. Either button is off with the first reason that stops it: unfinished stories, then
 * the merge's own reasons in ADR 0037's order, or "Checking…" before the server's first read. A PR merged on GitHub at
 * the branch's commit says so beside the button that finishes it. Null for a feature not in progress nor merged.
 */
export function featureApprovalOf(
  card: Card,
  cards: readonly Card[],
  config: ProjectConfig,
  state: FeatureMergeState | undefined,
): FeatureApproval | null {
  const base = config.baseBranch;
  if (card.type !== "feature") return null;
  if (card.status === "done" && card.history.some((e) => e.field === "merged")) {
    return { step: "merged", ready: false, reason: null, base };
  }
  if (card.status !== "active") return null;
  const step = evidenceState(card).accepted ? "merge" : "approve";
  const reason = featureItemsRefusal(card.id, cards, config) ?? (state ? state.blocked : FEATURE_END_MESSAGES.checking);
  const m = FEATURE_END_MESSAGES;
  const note = reason === null && state?.landed ? (step === "approve" ? m.landed : m.settleLater(base)) : null;
  return { step, ready: reason === null, reason, base, ...(note ? { note } : {}) };
}

/** How many conflicting files the Dev Lead's notice names before it says how many more there are. */
export const NAMED_FILES = 3;

/** What the Dev Lead is told when the base moved on, or conflicts: merge it in, never rebase. */
export function behindMessage(branch: string, base: string, files: readonly string[]): string {
  const ask = `${base} has moved on. Merge ${base} into ${branch} with a merge commit, never a rebase, and commit it.`;
  if (files.length === 0) return ask;
  const more = files.length - NAMED_FILES;
  const named = files.slice(0, NAMED_FILES).join(", ");
  return `${ask} These files conflict: ${more > 0 ? `${named} and ${more} more` : named}.`;
}
