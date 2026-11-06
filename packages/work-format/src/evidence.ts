import { isKnownStatus, stageCategory } from "./config.ts";
import { CANCELLED, type Card, type ContainerStatus, type ProjectConfig } from "./types.ts";

/**
 * Evidence vocabulary written to `history[]` with field `evidence` (ADR 0004):
 * - `verified` / `unverified`: the PR's required CI checks passed / stopped passing (e.g. a new push)
 * - `proven:<n>` / `unproven:<n>`: AC number n (1-based) had its linked test pass / fail
 * Acceptance uses field `accepted` with `accepted` / `withdrawn`.
 */
export const VERIFIED = "verified";
export const UNVERIFIED = "unverified";
export const provenEvent = (ac: number) => `proven:${ac}`;
export const unprovenEvent = (ac: number) => `unproven:${ac}`;

export interface EvidenceState {
  /** The latest status change was made by an agent session: it is the agent's claim, not proof. */
  reported: boolean;
  /** CI passed on the PR. */
  verified: boolean;
  /** AC numbers (1-based) whose linked test passed. */
  provenAcs: number[];
  /** Every AC is proven (false when the card has no ACs). */
  proven: boolean;
  /** The user signed off. */
  accepted: boolean;
}

export function evidenceState(card: Card): EvidenceState {
  let verified = false;
  let accepted = false;
  const proven = new Set<number>();
  for (const e of card.history) {
    if (e.field === "evidence") {
      if (e.to === VERIFIED) verified = true;
      else if (e.to === UNVERIFIED) verified = false;
      else {
        const m = /^(proven|unproven):(\d+)$/.exec(e.to ?? "");
        if (m) m[1] === "proven" ? proven.add(Number(m[2])) : proven.delete(Number(m[2]));
      }
    } else if (e.field === "accepted") {
      accepted = e.to === "accepted";
    }
  }
  const lastStatus = card.history.filter((e) => e.field === "status").at(-1);
  const provenAcs = [...proven].filter((n) => n >= 1 && n <= card.acs.length).sort((a, b) => a - b);
  return {
    reported: !!lastStatus && lastStatus.by.startsWith("session:"),
    verified,
    provenAcs,
    proven: card.acs.length > 0 && provenAcs.length === card.acs.length,
    accepted,
  };
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

const CONTAINER_STATUSES: ContainerStatus[] = ["draft", "approved", "active", "done", "cancelled"];

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
  if (!CONTAINER_STATUSES.includes(to as ContainerStatus))
    return { ok: false, reason: `"${to}" is not a valid ${card.type} status` };
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
