/**
 * Ending a feature (STORY-14, ADR 0037): pure rules over its card. Accept applies to a feature in progress once every
 * story and bug under it is Done or Cancelled, and it is the user's alone. Accepted is a fact in the card's history, as
 * for a story; it gates Merge to main, which also waits for the feature's checks on the commit its branch is at, and
 * for main to be in that commit's history without conflicts. Only the merge makes the feature Done, by `system`, with
 * the merge in its history.
 */
import { stageCategory } from "./config.ts";
import { evidenceState } from "./evidence.ts";
import { FEATURE_END_MESSAGES, type CardFeatureEnd, type FeatureMergeState } from "./feature-end-copy.ts";
import { appendHistory, recordAcceptance, setPr, setStatus } from "./history.ts";
import { CANCELLED, type Card, type ProjectConfig } from "./types.ts";

/** The stories and bugs under feature `id`. */
const itemsOf = (id: string, cards: readonly Card[]) =>
  cards.filter((c) => (c.type === "story" || c.type === "bug") && c.parent === id);

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
  const items = itemsOf(card.id, cards);
  const done = items.filter((c) => stageCategory(c.status, config) === "done");
  const open = items.filter((c) => c.status !== CANCELLED && stageCategory(c.status, config) !== "done");
  if (open.length > 0) return FEATURE_END_MESSAGES.unfinished(id, open.length);
  return done.length === 0 ? FEATURE_END_MESSAGES.empty(id) : null;
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

/** What the server found of an accepted feature, which Merge to main waits on. */
export interface FeatureMergeFacts {
  base: string;
  branch: string;
  /** The base's tip isn't in the feature branch's history. */
  behind: boolean;
  /** Merging the feature into the base conflicts. */
  conflicts: boolean;
  /** Its PR on GitHub: none yet, open, or closed; null in local mode. */
  pr: "none" | "open" | "closed" | null;
  /** The feature branch on GitHub has commits the local one doesn't. */
  remoteAhead: boolean;
  checks: FeatureChecks;
}

/** Why Merge to main waits, or null when it can go. */
export function featureMergeBlock(f: FeatureMergeFacts): string | null {
  const m = FEATURE_END_MESSAGES;
  if (f.conflicts) return m.conflicts(f.base);
  if (f.behind) return m.behind(f.base);
  if (f.pr === "none") return m.noPr;
  if (f.pr === "closed") return m.prClosed;
  if (f.remoteAhead) return m.remoteAhead(f.branch);
  if (f.checks === "passed") return null;
  if (f.checks === "no-command") return m.noCommand;
  return f.checks === "running" ? m.running : f.checks === "failed" ? m.failed : m.pending;
}

export const mergeStateOf = (facts: FeatureMergeFacts): FeatureMergeState => {
  const blocked = featureMergeBlock(facts);
  return { mergeable: blocked === null, blocked };
};

/** The card pane's view of a feature's end; undefined for anything but a feature in progress. */
export function featureEndOf(
  card: Card,
  cards: readonly Card[],
  config: ProjectConfig,
  state: FeatureMergeState | undefined,
): CardFeatureEnd | undefined {
  if (card.type !== "feature" || card.status !== "active") return undefined;
  const acceptable = featureAcceptRefusal(card, card.id, cards, config) === null;
  if (!evidenceState(card).accepted) return { acceptable, accepted: false, mergeable: false, blocked: null };
  return { acceptable: false, accepted: true, mergeable: state?.mergeable === true, blocked: state?.blocked ?? null };
}

/** What the Dev Lead is told when the base moved on, or conflicts: merge it in, never rebase. */
export function behindMessage(branch: string, base: string, files: readonly string[]): string {
  const ask = `${base} has moved on. Merge ${base} into ${branch} with a merge commit, never a rebase, and commit it.`;
  return files.length === 0 ? ask : `${ask} These files conflict: ${files.join(", ")}.`;
}
