/**
 * Story PRs (STORY-11): pure rules. What `gh` says about a PR becomes its state and one verdict for its checks; that
 * verdict is the CI evidence when the project's checks run in CI (ADR 0004). GitHub can't tell `gh pr view` which
 * checks are required, so every check it reports counts.
 */
import type { CheckOutcome } from "./checks.ts";
import { GITHUB_COPY, type GithubUse, type PrChecks, type PrState, type PrStatus } from "./prs-types.ts";
import type { Card } from "./types.ts";
import type { WorkList } from "./work-list-types.ts";
import { isRecord } from "./utils/guards.ts";

/** The `--json` fields Featra asks `gh pr view` and `gh pr list` for. */
export const PR_FIELDS = "number,url,state,isDraft,statusCheckRollup";

/** A check run's conclusions that mean it failed. */
const FAILED = new Set(["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE", "ERROR"]);
/** Conclusions that pass, or say nothing against the PR. */
const PASSED = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);

const upper = (v: unknown) => (typeof v === "string" ? v.toUpperCase() : "");

/** One entry of `statusCheckRollup`: a check run (status, conclusion) or a commit status (state, and no conclusion). */
function entryVerdict(entry: unknown): "passed" | "failed" | "pending" {
  if (!isRecord(entry)) return "pending";
  if ("state" in entry && !("conclusion" in entry)) {
    const state = upper(entry.state);
    if (state === "SUCCESS") return "passed";
    return FAILED.has(state) ? "failed" : "pending";
  }
  if (upper(entry.status) !== "COMPLETED") return "pending";
  const conclusion = upper(entry.conclusion);
  if (FAILED.has(conclusion)) return "failed";
  return PASSED.has(conclusion) ? "passed" : "pending";
}

/** The checks of a PR as one verdict: a failure wins over checks still running; no checks at all is `none`. */
export function checksVerdict(rollup: unknown): PrChecks {
  if (!Array.isArray(rollup) || rollup.length === 0) return "none";
  const verdicts = new Set((rollup as unknown[]).map(entryVerdict));
  if (verdicts.has("failed")) return "failing";
  return verdicts.has("pending") ? "pending" : "passing";
}

/** A PR as `gh pr view --json`, `gh pr list --json` or `gh api …/pulls` answers it; null when it isn't one. */
export function readPr(raw: unknown): { number: number; url: string; status: PrStatus } | null {
  if (!isRecord(raw)) return null;
  const url = typeof raw.url === "string" ? raw.url : typeof raw.html_url === "string" ? raw.html_url : null;
  const number = typeof raw.number === "number" && Number.isInteger(raw.number) ? raw.number : null;
  if (url === null || number === null || !url.startsWith("https://")) return null;
  const state = typeof raw.state === "string" ? raw.state.toUpperCase() : "";
  const merged = state === "MERGED" || raw.merged === true || typeof raw.merged_at === "string";
  const draft = raw.isDraft === true || raw.draft === true;
  let prState: PrState;
  if (merged) prState = "merged";
  else if (state === "CLOSED") prState = "closed";
  else if (state === "OPEN") prState = draft ? "draft" : "open";
  else return null;
  return { number, url, status: { state: prState, checks: checksVerdict(raw.statusCheckRollup) } };
}

/** A PR that may still change: open or draft. Merged and closed PRs are not read again. */
export const prIsOpen = (status: PrStatus | null | undefined): boolean =>
  !status || status.state === "open" || status.state === "draft";

/**
 * The CI evidence of a PR's checks: passing makes the story Verified, failing removes it. Checks still running, or no
 * checks, change nothing.
 */
export function ciOutcome(checks: PrChecks): CheckOutcome {
  return { passed: checks === "passing" ? true : checks === "failing" ? false : null, acs: [] };
}

/** What Featra found: a GitHub remote, a `gh` that runs, and whether it is signed in. */
export interface GithubFacts {
  remote: boolean;
  gh: boolean;
  signedIn: boolean;
}

/** Whether GitHub is usable, and the one line that says what is missing when it isn't. */
export function githubUse({ remote, gh, signedIn }: GithubFacts): GithubUse {
  if (!remote) return { usable: false, missing: GITHUB_COPY.noRemote };
  if (!gh) return { usable: false, missing: GITHUB_COPY.noGh };
  if (!signedIn) return { usable: false, missing: GITHUB_COPY.signedOut };
  return { usable: true, missing: null };
}

/** A strict GitHub PR URL, safe to hand to `gh` as one argument; null for anything else. */
export function githubPrUrl(url: string | null): string | null {
  return url && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(url) ? url : null;
}

/** A branch name safe to hand to `git` and `gh` as one argument on every platform. */
export const safeBranch = (branch: string | null): branch is string =>
  branch !== null && /^[\w./-]+$/.test(branch) && !branch.startsWith("-") && !branch.includes("..");

/** The new PR's title and body: the story's id and title, its user story, and its criteria. */
export function prContent(card: Card): { title: string; body: string } {
  const criteria = card.acs.map((ac) => `- [${ac.done ? "x" : " "}] ${ac.text}`).join("\n");
  const body = [
    card.description.trim(),
    criteria && `## Acceptance criteria\n\n${criteria}`,
    `Opened by Featra for ${card.id}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { title: `${card.id}: ${card.title}`, body };
}

/** `list` with each story row's PR state as last read, for the Work rows. */
export function withPrStatus(list: WorkList, statusOf: (id: string, pr: string) => PrStatus | undefined): WorkList {
  return {
    ...list,
    epics: list.epics.map((epic) => ({
      ...epic,
      features: epic.features.map((feature) => ({
        ...feature,
        stories: feature.stories.map((row) => {
          const prStatus = row.pr ? statusOf(row.id, row.pr) : undefined;
          return prStatus ? { ...row, prStatus } : row;
        }),
      })),
    })),
  };
}
