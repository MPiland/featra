/**
 * The design review's types, copy and card-view reader (STORY-73, ADR 0045). Kept free of config and YAML so the card
 * view, which the sandboxed preload bundles, can carry it; the rules are in design-review.ts.
 */
import { isRecord } from "./utils/guards.ts";

export type DesignReviewStatus = "waiting" | "findings" | "cleared";

/** Where a story's design review stands, and the screenshots it is of. */
export interface DesignReview {
  status: DesignReviewStatus;
  /** The screenshots, as the card links them. */
  shots: string[];
  /** The last findings, while they are open. */
  findings?: string;
  /** The story's session reported the last findings fixed, so it waits again. */
  fixed?: boolean;
}

/** A card view's design review: with leadGone when the Dev Lead chat that started the story is gone. */
export type DesignReviewView = DesignReview & { leadGone?: boolean };

/** What a report does to the design review: the Dev Lead's findings or clear, or the story session's fix. */
export type DesignReviewInput = { findings: string } | { clear: true } | { fixed: true };

/** The longest findings a report carries, in characters. */
export const FINDINGS_MAX = 2000;

export const DESIGN_REVIEW_COPY = {
  label: "Design review",
  status: { waiting: "waiting", findings: "findings sent", cleared: "cleared" } satisfies Record<
    DesignReviewStatus,
    string
  >,
  setting: "Design review of screenshots",
  settingHint: "The Dev Lead checks a story's screenshots before it moves to Acceptance.",
  leadGone: (id: string) => `The Dev Lead chat that started ${id} is gone. Clear the review or send ${id} back.`,
  clear: "Clear review",
  cleared: "cleared the design review",
  sent: (id: string) => `sent the design findings to ${id}`,
  fixed: "reported the design findings fixed",
  /** What the story's session hears: the Dev Lead's findings, and how to say they're fixed. */
  message: (id: string, findings: string) =>
    `Design review of ${id}'s screenshots found:\n\n${findings}\n\nFix them, then report with update_card's designReview {fixed: true}.`,
  /** The notice that tells the Dev Lead a story waits for it. */
  notice: (folder: string, names: readonly string[], fixed: boolean) =>
    `${fixed ? "Findings fixed. " : ""}Screenshots in ${folder}: ${names.join(", ")}`,
} as const;

/** The design review a card view carries, read from the socket, or undefined when it is malformed. */
export function normalizeDesignReview(raw: unknown): DesignReviewView | undefined {
  if (!isRecord(raw)) return undefined;
  const status = raw.status;
  if (status !== "waiting" && status !== "findings" && status !== "cleared") return undefined;
  const shots = Array.isArray(raw.shots) ? raw.shots.filter((s): s is string => typeof s === "string") : [];
  return {
    status,
    shots,
    ...(typeof raw.findings === "string" && raw.findings ? { findings: raw.findings } : {}),
    ...(raw.fixed === true ? { fixed: true } : {}),
    ...(raw.leadGone === true ? { leadGone: true } : {}),
  };
}
