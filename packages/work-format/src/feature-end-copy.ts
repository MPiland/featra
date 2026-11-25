/**
 * Ending a feature (STORY-14, ADR 0037): what the card and the review screen show of it, and what Approve, Accept and
 * Merge to main say (STORY-70). Copy and socket shapes only, so the client can import it without the card parser.
 */
import { isOneOf, isRecord } from "./utils/guards.ts";

/** What the server knows of a finished feature beyond its card: whether it can merge, and why not. */
export interface FeatureMergeState {
  mergeable: boolean;
  blocked: string | null;
  /** Its PR merged on GitHub at the commit its branch is at, and the feature isn't Done yet: the click finishes it. */
  landed?: true;
}

/**
 * Where a feature's approval stands on its review screen (STORY-70): `approve` offers Approve, which accepts and merges
 * in one click; `merge` is a feature accepted whose merge hasn't happened (it failed, or it was accepted before
 * Approve), offering Merge to main again; `merged` is Done, merged to the base.
 */
export const APPROVAL_STEPS = ["approve", "merge", "merged"] as const;
export type ApprovalStep = (typeof APPROVAL_STEPS)[number];

export interface FeatureApproval {
  step: ApprovalStep;
  /** Nothing stops the step's button now. */
  ready: boolean;
  /** Why the button is off, in the order ADR 0037 gives (unfinished stories first); null when it is on. */
  reason: string | null;
  /** The branch it merges into: the project's base branch. */
  base: string;
  /** What the screen says beside the button while it is on: its PR merged on GitHub, and the click finishes it. */
  note?: string;
}

export function normalizeFeatureApproval(raw: unknown): FeatureApproval | null {
  if (!isRecord(raw) || !isOneOf(APPROVAL_STEPS, raw.step)) return null;
  const reason = typeof raw.reason === "string" && raw.reason ? raw.reason : null;
  return {
    step: raw.step,
    ready: raw.ready === true && reason === null,
    reason,
    base: typeof raw.base === "string" && raw.base ? raw.base : "main",
    ...(reason === null && typeof raw.note === "string" && raw.note ? { note: raw.note } : {}),
  };
}

export const FEATURE_END_COPY = {
  merge: (base: string) => `Merge to ${base}`,
  mergeOf: (id: string, base: string) => `Merge ${id} to ${base}`,
  merging: "Merging…",
  approve: "Approve",
  approveOf: (id: string) => `Approve ${id}`,
  merged: (base: string) => `Merged to ${base}`,
} as const;

export const FEATURE_END_MESSAGES = {
  gone: "That card is gone.",
  notFeature: (id: string) => `${id} isn't a feature.`,
  notActive: (id: string) => `${id} isn't in progress.`,
  accepted: (id: string) => `${id} is already accepted.`,
  unfinished: (id: string, n: number) => `${id} has ${n} unfinished ${n === 1 ? "item" : "items"}.`,
  empty: (id: string) => `${id} has nothing done yet.`,
  noBranch: (id: string) => `${id} has no branch.`,
  notAccepted: (id: string) => `Accept ${id} first.`,
  merging: (id: string) => `${id} is already merging.`,
  behind: (base: string) => `${base} has moved on. The Dev Lead is merging it in.`,
  conflicts: (base: string) => `It conflicts with ${base}. The Dev Lead is merging ${base} in.`,
  noPr: "Open its PR first.",
  checking: "Checking…",
  prMergedBehind: "Its PR merged without this computer's latest commits.",
  landed: "Merged on GitHub. Approve to finish.",
  settleLater: (base: string) => `Merged. Featra will mark it Done on ${base}.`,
  prClosed: "Its PR is closed.",
  remoteAhead: (branch: string) => `${branch} has commits on GitHub that this computer doesn't. Pull it.`,
  running: "Checks are running.",
  failed: "Checks failed.",
  pending: "Checks haven't passed on its latest commit yet.",
  noCommand: "Set a check command in Project settings.",
  baseBusy: (base: string) => `${base} has local changes. Commit or stash them, then merge again.`,
  moved: (branch: string) => `${branch} moved meanwhile. Merge again.`,
} as const;
