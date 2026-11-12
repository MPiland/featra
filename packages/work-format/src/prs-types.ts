/**
 * A story's PR as the card and the Work row show it (STORY-11): its state and its checks, as last read through the
 * user's `gh`, and whether GitHub is usable for the project at all. Types, copy and the checks for data that crosses
 * the socket only, so the client can import it without the card parser.
 */
import { isOneOf, isRecord } from "./utils/guards.ts";

export type PrState = "open" | "draft" | "merged" | "closed";
export const PR_STATES: readonly PrState[] = ["open", "draft", "merged", "closed"];

/** Every check passed, one failed, some are still running, or the PR has none. */
export type PrChecks = "passing" | "failing" | "pending" | "none";
export const PR_CHECKS: readonly PrChecks[] = ["passing", "failing", "pending", "none"];

/** What was last read of a PR. */
export interface PrStatus {
  state: PrState;
  checks: PrChecks;
}

/** What the card pane shows about a story's PR besides its link, which is the card's own `pr` field. */
export interface CardPr {
  /** The PR's state and checks as last read; null before the first read. */
  status: PrStatus | null;
  /** Create PR is offered: GitHub is usable and the story is in review with no PR, and none is being opened. */
  create: boolean;
  /** Featra is pushing the branch and opening the PR. */
  opening: boolean;
  /** Why the last try to open it failed, else null. */
  note: string | null;
}

/** Whether Featra can use GitHub for a project: a GitHub remote and a signed-in `gh`. Local mode otherwise. */
export interface GithubUse {
  usable: boolean;
  /** One line on what is missing, for Project settings; null when usable. */
  missing: string | null;
}

export const GITHUB_COPY = {
  noRemote: "Local mode: no GitHub remote, so Featra opens no PRs.",
  noGh: "Local mode: the GitHub CLI (gh) isn't installed, so Featra opens no PRs.",
  signedOut: "Local mode: gh isn't signed in to GitHub, so Featra opens no PRs. Run gh auth login.",
} as const;

/** A link Featra may hand to the OS browser: an https URL with no spaces or quotes, else null. */
export function httpsLink(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^https:\/\/[^\s"'<>]+$/.test(raw)) return null;
  try {
    return new URL(raw).protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

/** The PR number in a PR's URL, or in a `pr` recorded as the number alone (`12`, `#12`); null when it has none. */
export function prNumber(pr: string): number | null {
  const m = /\/pull\/(\d+)(?:[/?#]|$)/.exec(pr) ?? /^#?(\d+)$/.exec(pr.trim());
  return m ? Number(m[1]) : null;
}

/** The chip's label: the PR number (`#14`), never the URL. */
export const prLabel = (url: string): string => {
  const n = prNumber(url);
  return n === null ? "PR" : `#${n}`;
};

export function normalizePrStatus(raw: unknown): PrStatus | null {
  if (!isRecord(raw) || !isOneOf(PR_STATES, raw.state)) return null;
  return { state: raw.state, checks: isOneOf(PR_CHECKS, raw.checks) ? raw.checks : "none" };
}

export function normalizeCardPr(raw: unknown): CardPr | undefined {
  if (!isRecord(raw)) return undefined;
  return {
    status: normalizePrStatus(raw.status),
    create: raw.create === true,
    opening: raw.opening === true,
    note: typeof raw.note === "string" && raw.note ? raw.note : null,
  };
}

export function normalizeGithubUse(raw: unknown): GithubUse {
  const r = isRecord(raw) ? raw : {};
  const usable = r.usable === true;
  return { usable, missing: !usable && typeof r.missing === "string" && r.missing ? r.missing : null };
}
