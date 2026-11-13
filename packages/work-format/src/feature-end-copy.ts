/**
 * Ending a feature (STORY-14, ADR 0037): what the card pane shows of it and what Accept and Merge to main say. Copy
 * and socket shapes only, so the client can import it without the card parser.
 */
import { isRecord } from "./utils/guards.ts";

/** A feature's end as its card shows it: Accept, Merge to main, and why Merge to main waits. */
export interface CardFeatureEnd {
  /** Every story and bug under it is Done or Cancelled, and it isn't accepted yet: Accept applies. */
  acceptable: boolean;
  /** The user accepted it: Merge to main shows, on or off. */
  accepted: boolean;
  /** Accepted, and nothing stops Merge to main now. */
  mergeable: boolean;
  /** Why Merge to main waits, once accepted; null when it doesn't. */
  blocked: string | null;
}

/** What the server knows of an accepted feature beyond its card: whether it can merge, and why not. */
export interface FeatureMergeState {
  mergeable: boolean;
  blocked: string | null;
}

export function normalizeFeatureEnd(raw: unknown): CardFeatureEnd | undefined {
  if (!isRecord(raw)) return undefined;
  return {
    acceptable: raw.acceptable === true,
    accepted: raw.accepted === true,
    mergeable: raw.mergeable === true,
    blocked: typeof raw.blocked === "string" && raw.blocked ? raw.blocked : null,
  };
}

export const FEATURE_END_COPY = {
  accept: "Accept",
  acceptOf: (id: string) => `Accept ${id}`,
  merge: "Merge to main",
  mergeOf: (id: string) => `Merge ${id} to main`,
  merging: "Merging…",
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
  prClosed: "Its PR is closed.",
  remoteAhead: (branch: string) => `${branch} has commits on GitHub that this computer doesn't. Pull it.`,
  running: "Checks are running.",
  failed: "Checks failed.",
  pending: "Checks haven't passed on its latest commit yet.",
  noCommand: "Set a check command in Project settings.",
  baseBusy: (base: string) => `${base} has local changes. Commit or stash them, then merge again.`,
  moved: (branch: string) => `${branch} moved meanwhile. Merge again.`,
} as const;
