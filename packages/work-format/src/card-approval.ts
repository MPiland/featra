/**
 * Approving a draft (STORY-51, ADR 0023): pure rules over cards. Approval moves the feature from draft to approved,
 * records its scope baseline (the stories live at that moment) and decides which draft stories are kept. A story
 * cancelled while the feature was a draft was never committed, so approval drops it instead of committing it.
 */
import { draftedBy, needsReview } from "./card-draft-guard.ts";
import { setStatus } from "./history.ts";
import { isRecord } from "./utils/guards.ts";
import { CANCELLED, type Card } from "./types.ts";

/** The frontmatter key of a feature's scope baseline, set by approval. */
export const BASELINE = "baseline";

/** The scope a feature was approved with. */
export interface Baseline {
  /** When it was approved. */
  at: string;
  /** The stories live then, in order. */
  stories: string[];
}

/** A feature's stored baseline, or null when it has none (not approved, or approved before baselines were stored). */
export function baselineOf(feature: Pick<Card, "extra">): Baseline | null {
  const raw = feature.extra[BASELINE];
  if (!isRecord(raw) || typeof raw.at !== "string" || !Array.isArray(raw.stories)) return null;
  return { at: raw.at, stories: raw.stories.filter((s): s is string => typeof s === "string") };
}

/** Why `card` can't be approved or rejected as a draft, or null when it can. One wording for both actions. */
export function notDraftReason(card: Card | undefined, id: string): string | null {
  if (!card) return "That card is gone.";
  if (card.type !== "feature" || draftedBy(card) === null) return `${id} isn't a draft.`;
  if (card.status !== "draft") return `${id} is already ${card.status}.`;
  return needsReview(card) ? null : `${id} isn't a draft.`;
}

/** The draft's stories: every story under the feature, whatever its stage, in order. */
export function draftStories(featureId: string, cards: readonly Card[]): Card[] {
  return cards
    .filter((c) => c.type === "story" && c.parent === featureId)
    .toSorted((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export type ApprovalPlan =
  | {
      ok: true;
      /** The feature as approved: status, baseline and history. */
      feature: Card;
      /** The stories that are live, written as they are: they stay where they were (New). */
      keep: Card[];
      /** The stories cancelled in draft, which approval deletes. */
      drop: Card[];
    }
  | { ok: false; error: string };

/** The commit message of an approval. */
export const approvalMessage = (feature: Pick<Card, "id" | "title">): string =>
  `${feature.id}: approved ${feature.title.replace(/\s+/g, " ").trim()}`;

/** What approving feature `id` does, as by `user` at `at`, or why it can't be. */
export function planApproval(id: string, cards: readonly Card[], at: string): ApprovalPlan {
  const feature = cards.find((c) => c.id === id);
  const refusal = notDraftReason(feature, id);
  if (refusal !== null || !feature) return { ok: false, error: refusal ?? "That card is gone." };
  const stories = draftStories(id, cards);
  const keep = stories.filter((s) => s.status !== CANCELLED);
  if (!keep.length) return { ok: false, error: `${id} has no stories to approve.` };
  const baseline: Baseline = { at, stories: keep.map((s) => s.id) };
  const approved = setStatus(feature, "approved", "user", at);
  return {
    ok: true,
    feature: { ...approved, extra: { ...approved.extra, [BASELINE]: baseline } },
    keep,
    drop: stories.filter((s) => s.status === CANCELLED),
  };
}
