/**
 * Starting an approved feature (STORY-52, ADR 0024): pure rules over cards. Start gives a feature its own branch,
 * `feature/<N>-<slug>`, and the feature becomes active there. These say what the branch is called, why a feature can't
 * be started, and what the feature's card says once it has been.
 */
import { featureIdOfBranch } from "./branch-rules.ts";
import { draftAuthor } from "./card-draft-guard.ts";
import { setStatus } from "./history.ts";
import { parseId, slugify } from "./ids.ts";
import type { Card } from "./types.ts";
import { isRecord } from "./utils/guards.ts";

/** The status a feature has once it is approved and not yet started. */
export const APPROVED = "approved";
/** The status a started feature has. */
export const ACTIVE = "active";

/** `feature/<N>-<slug of title>` for the feature (`feature/<N>` when the title has no letters or digits). */
export function featureBranchName(card: Pick<Card, "id" | "title">): string {
  const n = parseId(card.id)?.n ?? 0;
  const slug = slugify(card.title);
  return slug ? `feature/${n}-${slug}` : `feature/${n}`;
}

/** Why `card` can't be started, or null when it can. */
export function notStartableReason(card: Card | undefined, id: string): string | null {
  if (!card) return "That card is gone.";
  if (card.type !== "feature") return `${id} isn't a feature.`;
  if (card.status === APPROVED) return null;
  if (card.status === "draft") return `${id} isn't approved yet. Approve it first.`;
  return `${id} is already ${card.status}.`;
}

/** The branch among `branches` that already belongs to feature `id` (any `feature/<N>…`), or null. */
export const existingBranchOf = (id: string, branches: readonly string[]): string | null =>
  branches.find((b) => featureIdOfBranch(b) === id) ?? null;

/** Who started it: `user`, or `session:<chat>` for an agent's chat. */
export const starter = (chat: string | null): string => (chat === null ? "user" : draftAuthor(chat));

/** The feature as started by `by` at `at`: active, with the status event in its history. */
export const startedFeature = (feature: Card, by: string, at: string): Card => setStatus(feature, ACTIVE, by, at);

/** The commit message of a start. */
export const startMessage = (feature: Pick<Card, "id" | "title">): string =>
  `${feature.id}: started ${feature.title.replace(/\s+/g, " ").trim()}`;

/** The feature id of a `start_feature` call, or why it isn't one. */
export function parseStartInput(input: unknown): { ok: true; id: string } | { ok: false; error: string } {
  const id = isRecord(input) && typeof input.feature === "string" ? input.feature.trim().toUpperCase() : "";
  return parseId(id)?.prefix === "FEAT"
    ? { ok: true, id }
    : { ok: false, error: "Give the feature's id, such as FEAT-5, as `feature`." };
}
