/**
 * The design review of a story's screenshots (STORY-73, ADR 0045): pure rules. When a story with screenshots reaches
 * review, the Dev Lead that delegated it checks them for layout and design problems, and records findings or clears
 * the check with `update_card`. The story doesn't move on to Acceptance until the check is cleared.
 *
 * A story "has screenshots" when a criterion's evidence is one Featra attached (STORY-25): a page it captured or a
 * test's screenshot it matched (`ac<n>-page.*`, `ac<n>-test.*`). An agent's own image file is evidence, not a
 * screenshot to review. The check is on by default when the project's proof captures screenshots, and the project can
 * turn it off (`designReview: false`). Each finding, fix and clear is a `design-review` event in the card's history; a
 * round starts each time the story moves into its review stage, so a story sent back, or moved back from Acceptance,
 * is reviewed again.
 */
import { evidenceFolder } from "./evidence-link.ts";
import { isProofShot } from "./proof-files.ts";
import { capturesScreenshots } from "./proof-types.ts";
import { inReview, reviewStage, stageCeiling } from "./review-stages.ts";
import { isRecord } from "./utils/guards.ts";
import type { Card, HistoryEvent, ProjectConfig } from "./types.ts";
import { DESIGN_REVIEW_COPY, FINDINGS_MAX, type DesignReview, type DesignReviewInput } from "./design-review-types.ts";

const FIELD = "design-review";
const FINDINGS = "findings: ";

export const DESIGN_REVIEW_ERRORS = {
  bad: `"designReview" is {findings: text of at most ${FINDINGS_MAX} characters}, {clear: true} or {fixed: true}.`,
  none: (id: string) =>
    `${id} has no design review now: it is for a story in review with screenshots, when the project's design review is on.`,
  leadOnly: (id: string) => `Only the Dev Lead reviews ${id}'s screenshots.`,
  sessionOnly: (id: string) => `Only ${id}'s session reports its design findings fixed.`,
  noFindings: (id: string) => `${id} has no open design findings to fix.`,
  waits: (id: string) =>
    `${id} waits for its design review: the Dev Lead clears it with update_card's designReview first.`,
  capturing: (id: string) => `${id}'s screenshots are still being captured: move it on once they're attached.`,
  skip: (id: string, review: string) =>
    `Move ${id} to ${review} first: the Dev Lead reviews its screenshots there before it moves on.`,
} as const;

/** Whether the project's design review is on: its own choice, else on when its proof captures screenshots. */
export const designReviewOn = (config: ProjectConfig): boolean =>
  config.designReview ?? capturesScreenshots(config.proof);

/** The screenshots Featra attached to `card`'s criteria. */
export function proofShots(card: Card): string[] {
  const folder = evidenceFolder(card);
  return folder === null
    ? []
    : card.acs.flatMap((ac) => (ac.evidence && isProofShot(folder, ac.evidence) ? [ac.evidence] : []));
}

/** Whether the project reviews in a stage of its own, before the ceiling: else there is no move to gate. */
const separateReview = (config: ProjectConfig): boolean => {
  const review = reviewStage(config);
  return review !== null && review !== stageCeiling(config);
};

/**
 * The `design-review` events since the story last moved into its review stage, from anywhere: from before it, sent
 * back, or moved back from Acceptance by the user. A clear from an earlier round never carries over.
 */
function round(card: Card, config: ProjectConfig): HistoryEvent[] {
  const review = reviewStage(config);
  let start = 0;
  for (const [i, e] of card.history.entries()) {
    if (e.field === "status" && e.to === review && e.from !== review) start = i;
  }
  return card.history.slice(start).filter((e) => e.field === FIELD);
}

/** Where `card`'s design review stands, or null when it has none: not a story in review with screenshots, or off. */
export function designReviewState(card: Card, config: ProjectConfig): DesignReview | null {
  if (card.type !== "story" || !designReviewOn(config) || !separateReview(config)) return null;
  if (!inReview(card.status, config)) return null;
  const shots = proofShots(card);
  if (shots.length === 0) return null;
  const last = round(card, config).at(-1)?.to ?? null;
  if (last === "cleared") return { status: "cleared", shots };
  // A story that reached the ceiling without a clear (moved by the user) shows none: there is nothing left to gate.
  if (card.status === stageCeiling(config)) return null;
  if (last?.startsWith(FINDINGS)) return { status: "findings", shots, findings: last.slice(FINDINGS.length) };
  return last === "fixed" ? { status: "waiting", shots, fixed: true } : { status: "waiting", shots };
}

/** The `designReview` input of a report, or why it isn't one; undefined when it has none. */
export function parseDesignReview(
  raw: unknown,
): { ok: true; value?: DesignReviewInput } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true };
  if (!isRecord(raw)) return { ok: false, error: DESIGN_REVIEW_ERRORS.bad };
  const keys = Object.keys(raw);
  if (keys.length !== 1) return { ok: false, error: DESIGN_REVIEW_ERRORS.bad };
  if (raw.clear === true) return { ok: true, value: { clear: true } };
  if (raw.fixed === true) return { ok: true, value: { fixed: true } };
  const findings = typeof raw.findings === "string" ? raw.findings.trim() : "";
  return findings && findings.length <= FINDINGS_MAX
    ? { ok: true, value: { findings } }
    : { ok: false, error: DESIGN_REVIEW_ERRORS.bad };
}

/** The event `input` records, or why the caller can't (`lead`: the Dev Lead, else the story's session). */
export function designReviewEvent(
  card: Card,
  input: DesignReviewInput,
  config: ProjectConfig,
  lead: boolean,
): { ok: true; to: string | null; change: string | null } | { ok: false; error: string } {
  const state = designReviewState(card, config);
  if (state === null || card.status === stageCeiling(config)) {
    return { ok: false, error: DESIGN_REVIEW_ERRORS.none(card.id) };
  }
  if ("fixed" in input) {
    if (lead) return { ok: false, error: DESIGN_REVIEW_ERRORS.sessionOnly(card.id) };
    if (state.status !== "findings") return { ok: false, error: DESIGN_REVIEW_ERRORS.noFindings(card.id) };
    return { ok: true, to: "fixed", change: DESIGN_REVIEW_COPY.fixed };
  }
  if (!lead) return { ok: false, error: DESIGN_REVIEW_ERRORS.leadOnly(card.id) };
  if ("clear" in input) {
    // Clearing a cleared review records nothing more.
    return state.status === "cleared"
      ? { ok: true, to: null, change: null }
      : { ok: true, to: "cleared", change: DESIGN_REVIEW_COPY.cleared };
  }
  return { ok: true, to: `${FINDINGS}${input.findings}`, change: DESIGN_REVIEW_COPY.sent(card.id) };
}

/** Why a report can't move `card` to `to`, or null: a story with screenshots waits for its design review. */
export function designReviewGate(card: Card, to: string, config: ProjectConfig): string | null {
  const ceiling = stageCeiling(config);
  if (to !== ceiling || card.status === ceiling || card.type !== "story") return null;
  if (!designReviewOn(config) || !separateReview(config)) return null;
  // The screenshots are attached as the story enters review, so it can't skip past the stage they are reviewed in.
  if (!inReview(card.status, config)) return DESIGN_REVIEW_ERRORS.skip(card.id, reviewStage(config) ?? ceiling);
  const state = designReviewState(card, config);
  return state === null || state.status === "cleared" ? null : DESIGN_REVIEW_ERRORS.waits(card.id);
}
