/**
 * How cards read at a glance in Work: a story's or feature's tone (its dot and its slice of a bar), the bar's slices,
 * and the breakdown a bar says on hover or focus (STORY-15). All computed from cards (ADR 0003).
 */
import { awaitingAcceptance } from "./acceptance.ts";
import { CONTAINER_STATUS_LABELS } from "./card-view-types.ts";
import { stageCategory } from "./config.ts";
import { CANCELLED, type Card, type ProjectConfig } from "./types.ts";
import type { Segment, Tone } from "./work-list-types.ts";

/**
 * A story's tone. The first active stage is work in progress; any later active stage (In Review, Acceptance) waits
 * on a review.
 */
export function stageTone(status: string, config: ProjectConfig): Tone {
  if (status === CANCELLED) return "cancelled";
  const category = stageCategory(status, config);
  if (category === "done") return "done";
  if (category !== "active") return "idle";
  return config.stages.find((s) => s.category === "active")?.name === status ? "active" : "review";
}

export function featureTone(status: string): Tone {
  if (status === "done") return "done";
  if (status === "active") return "active";
  if (status === "cancelled") return "cancelled";
  return "idle";
}

const BAR_ORDER: readonly Tone[] = ["done", "review", "active", "idle"];

/** A bar's slices: how many items have each tone, in bar order, leaving out tones with none. */
export function segments(tones: readonly Tone[]): Segment[] {
  return BAR_ORDER.map((tone) => ({ tone, count: tones.filter((t) => t === tone).length })).filter((s) => s.count);
}

/** The words of a feature's bar breakdown, in bar order. "needs your Accept" is the wording Done refusals use. */
export const STAGE_BREAKDOWN = {
  done: "done",
  accept: "needs your Accept",
  review: "in review",
  active: "in progress",
  idle: "not started",
} as const;

type StagePart = keyof typeof STAGE_BREAKDOWN;

/** "2 in progress · 1 not started": the parts with a count, joined; empty when there are none. */
function joined<K extends string>(order: readonly K[], words: Readonly<Record<K, string>>, keys: readonly K[]): string {
  return order
    .map((k) => [keys.filter((x) => x === k).length, words[k]] as const)
    .filter(([n]) => n > 0)
    .map(([n, word]) => `${n} ${word}`)
    .join(" · ");
}

function stagePart(item: Card, config: ProjectConfig): StagePart | null {
  const tone = stageTone(item.status, config);
  if (tone === "cancelled") return null;
  if (tone === "review") return awaitingAcceptance(item, config) ? "accept" : "review";
  return tone;
}

/**
 * What a feature's bar says: its items by where they stand, in bar order, e.g. "1 done · 1 needs your Accept · 2 in
 * progress · 1 not started". Cancelled items are left out, as from the counts. Empty for a feature with no items.
 */
export function stageBreakdown(items: readonly Card[], config: ProjectConfig): string {
  const parts = items.map((i) => stagePart(i, config)).filter((p): p is StagePart => p !== null);
  return joined(["done", "accept", "review", "active", "idle"], STAGE_BREAKDOWN, parts);
}

const FEATURE_ORDER = ["done", "active", "approved", "draft"] as const;
type FeaturePart = (typeof FEATURE_ORDER)[number];
/** A status as the Work list names it, in a sentence: "in progress". */
const word = (status: FeaturePart) => (CONTAINER_STATUS_LABELS[status] ?? status).toLowerCase();
const FEATURE_WORDS: Readonly<Record<FeaturePart, string>> = {
  done: word("done"),
  active: word("active"),
  approved: word("approved"),
  draft: word("draft"),
};

/**
 * What an epic's bar says: its features by status, in bar order, e.g. "1 done · 2 in progress · 1 approved". Cancelled
 * features are left out, as from the counts. Empty for an epic with no features.
 */
export function statusBreakdown(features: readonly Pick<Card, "status">[]): string {
  const parts = features.map((f) => f.status).filter((s): s is FeaturePart => FEATURE_ORDER.some((o) => o === s));
  return joined(FEATURE_ORDER, FEATURE_WORDS, parts);
}
