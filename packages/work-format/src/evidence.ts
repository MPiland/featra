import { isKnownStatus, stageCategory } from "./config.ts";
import { CANCELLED, CONTAINER_STATUSES, type Card, type ProjectConfig } from "./types.ts";
import { isOneOf } from "./utils/guards.ts";

/**
 * Evidence vocabulary written to `history[]` with field `evidence` (ADR 0004):
 * - `verified` / `unverified`: the PR's required CI checks passed / stopped passing (e.g. a new push)
 * - `proven:<n>` / `unproven:<n>`: AC number n (1-based) had its linked test pass / fail; `proven:<n>@<commit>` when
 *   the commit the test passed on is known (STORY-59), so auto-merge can tell proof for the commit it merges
 * - `checked:<commit>`: the commit the latest verdict was for, recorded when it changes (STORY-12), so a merge after a
 *   restart knows whether Verified is for the branch's current head; `checked:` alone when a verdict's commit wasn't
 *   known, so an older commit never stands beside a newer verdict
 * Acceptance uses field `accepted` with `accepted` / `withdrawn`.
 */
export const VERIFIED = "verified";
export const UNVERIFIED = "unverified";
export const provenEvent = (ac: number, head?: string) => `proven:${ac}${head ? `@${head}` : ""}`;
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

/** What a story waiting on the user's Accept needs, in a Done refusal and on a feature's bar (STORY-15). */
export const NEEDS_ACCEPT = "needs your Accept";

/** An evidence event's `proven:<n>[@<commit>]` or `unproven:<n>`, read; null for any other event. */
export function proofStep(e: Card["history"][number]): { ac: number; proven: boolean; commit: string | null } | null {
  const m = e.field === "evidence" ? /^(proven|unproven):(\d+)(?:@(\S+))?$/.exec(e.to ?? "") : null;
  return m ? { ac: Number(m[2]), proven: m[1] === "proven", commit: m[3] ?? null } : null;
}

/** Each proven AC number with the commit its test passed on (null when not recorded), in history order. */
export function provenCommits(card: Pick<Card, "history">): Map<number, string | null> {
  const proven = new Map<number, string | null>();
  for (const e of card.history) {
    const step = proofStep(e);
    if (step?.proven) proven.set(step.ac, step.commit);
    else if (step) proven.delete(step.ac);
  }
  return proven;
}

/**
 * Whether every AC of `card` is proven by a test that passed on commit `head` (STORY-59). Proof recorded without a
 * commit, or for another commit, doesn't count: auto-merge merges only what was proven at the commit it merges.
 */
export function provenAt(card: Card, head: string | null): boolean {
  if (!head || card.acs.length === 0) return false;
  const proven = provenCommits(card);
  return card.acs.every((_, i) => proven.get(i + 1) === head);
}

export function evidenceState(card: Card): EvidenceState {
  let verified = false;
  let accepted = false;
  let checkedHead: string | null = null;
  for (const e of card.history) {
    if (e.field === "evidence") {
      if (e.to === VERIFIED) verified = true;
      else if (e.to === UNVERIFIED) verified = false;
      else if (e.to?.startsWith(CHECKED)) checkedHead = e.to.slice(CHECKED.length) || null;
    } else if (e.field === "accepted") {
      accepted = e.to === "accepted";
    }
  }
  // A card's creation (no `from`) isn't progress: an agent that drafted a story hasn't reported on it.
  const lastClaim = card.history.findLast((e) => (e.field === "status" && e.from !== null) || e.field === "report");
  const provenAcs = [...provenCommits(card).keys()]
    .filter((n) => n >= 1 && n <= card.acs.length)
    .toSorted((a, b) => a - b);
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
        return ev.accepted ? { ok: true } : { ok: false, reason: `${NEEDS_ACCEPT} (research has no CI to verify)` };
      if (!ev.verified) return { ok: false, reason: "needs Verified: the PR's CI checks have not passed" };
      if (config.requireAccept && !ev.accepted) return { ok: false, reason: NEEDS_ACCEPT };
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
    if (config.requireAccept && !evidenceState(card).accepted) return { ok: false, reason: NEEDS_ACCEPT };
  }
  return { ok: true };
}
