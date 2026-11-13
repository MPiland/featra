import { isKnownStatus, stageCategory } from "./config.ts";
import { CANCELLED, CONTAINER_STATUSES, type Card, type ProjectConfig } from "./types.ts";
import { isOneOf } from "./utils/guards.ts";

/**
 * Evidence vocabulary written to `history[]` with field `evidence` (ADR 0004):
 * - `verified` / `unverified`: the PR's required CI checks passed / stopped passing (e.g. a new push)
 * - `proven:<n>` / `unproven:<n>`: AC number n (1-based) had its linked test pass / fail
 * - `checked:<commit>`: the commit the latest verdict was for, recorded when it changes (STORY-12), so a merge after a
 *   restart knows whether Verified is for the branch's current head; `checked:` alone when a verdict's commit wasn't
 *   known, so an older commit never stands beside a newer verdict
 * Acceptance uses field `accepted` with `accepted` / `withdrawn`.
 */
export const VERIFIED = "verified";
export const UNVERIFIED = "unverified";
export const provenEvent = (ac: number) => `proven:${ac}`;
export const unprovenEvent = (ac: number) => `unproven:${ac}`;
const CHECKED = "checked:";
export const checkedEvent = (commit: string) => `${CHECKED}${commit}`;

export interface EvidenceState {
  /** The latest status move or progress report was an agent session's: it is the agent's claim, not proof. */
  reported: boolean;
  /** CI passed on the PR. */
  verified: boolean;
  /** AC numbers (1-based) whose linked test passed. */
  provenAcs: number[];
  /** Every AC is proven (false when the card has no ACs). */
  proven: boolean;
  /** The user signed off. */
  accepted: boolean;
  /** The commit the latest verdict was for; null when none was recorded. */
  checkedHead: string | null;
}

export function evidenceState(card: Card): EvidenceState {
  let verified = false;
  let accepted = false;
  let checkedHead: string | null = null;
  const proven = new Set<number>();
  for (const e of card.history) {
    if (e.field === "evidence") {
      if (e.to === VERIFIED) verified = true;
      else if (e.to === UNVERIFIED) verified = false;
      else if (e.to?.startsWith(CHECKED)) checkedHead = e.to.slice(CHECKED.length) || null;
      else {
        const m = /^(proven|unproven):(\d+)$/.exec(e.to ?? "");
        if (m?.[1] === "proven") proven.add(Number(m[2]));
        else if (m?.[1] === "unproven") proven.delete(Number(m[2]));
      }
    } else if (e.field === "accepted") {
      accepted = e.to === "accepted";
    }
  }
  // A card's creation (no `from`) isn't progress: an agent that drafted a story hasn't reported on it.
  const lastClaim = card.history.findLast((e) => (e.field === "status" && e.from !== null) || e.field === "report");
  const provenAcs = [...proven].filter((n) => n >= 1 && n <= card.acs.length).toSorted((a, b) => a - b);
  return {
    reported: !!lastClaim && lastClaim.by.startsWith("session:"),
    verified,
    provenAcs,
    proven: card.acs.length > 0 && provenAcs.length === card.acs.length,
    accepted,
    checkedHead,
  };
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether a card may move to `to`.
 * - stories/bugs: the target must be a project stage or Cancelled; a done-category stage needs Verified,
 *   plus Accepted when the project requires it. Researcher stories need Accepted only (no code, no CI).
 * - Features: `done` needs every non-cancelled item done, plus Accepted when required.
 */
export function checkTransition(
  card: Card,
  to: string,
  config: ProjectConfig,
  cards: readonly Card[] = [],
): TransitionCheck {
  if (card.type === "story" || card.type === "bug") {
    if (!isKnownStatus(to, config)) return { ok: false, reason: `"${to}" is not a stage in this project` };
    if (to !== CANCELLED && stageCategory(to, config) === "done") {
      const ev = evidenceState(card);
      // Researcher stories produce findings, not code: there is no CI, so the user's Accept is the evidence.
      if (card.role === "researcher")
        return ev.accepted ? { ok: true } : { ok: false, reason: "needs your Accept (research has no CI to verify)" };
      if (!ev.verified) return { ok: false, reason: "needs Verified: the PR's CI checks have not passed" };
      if (config.requireAccept && !ev.accepted) return { ok: false, reason: "needs your Accept" };
    }
    return { ok: true };
  }
  if (!isOneOf(CONTAINER_STATUSES, to)) return { ok: false, reason: `"${to}" is not a valid ${card.type} status` };
  if (card.type === "feature" && to === "done") {
    const open = cards.filter(
      (c) =>
        (c.type === "story" || c.type === "bug") &&
        c.parent === card.id &&
        c.status !== CANCELLED &&
        stageCategory(c.status, config) !== "done",
    );
    if (open.length)
      return { ok: false, reason: `${open.length} item(s) not done: ${open.map((c) => c.id).join(", ")}` };
    if (config.requireAccept && !evidenceState(card).accepted) return { ok: false, reason: "needs your Accept" };
  }
  return { ok: true };
}
