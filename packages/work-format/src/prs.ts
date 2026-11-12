/**
 * Story PRs (STORY-11): pure rules. What `gh` says about a PR becomes its state and one verdict for its checks; that
 * verdict is the CI evidence when the project's checks run in CI (ADR 0004): the repo's required checks, as
 * `gh pr checks --required` buckets them, or every reported check when the repo requires none.
 */
import type { CheckOutcome } from "./checks.ts";
import { GITHUB_COPY, type GithubUse, type PrChecks, type PrState, type PrStatus } from "./prs-types.ts";
import type { Card } from "./types.ts";
import type { WorkList } from "./work-list-types.ts";
import { isRecord } from "./utils/guards.ts";

/** The `--json` fields Featra asks `gh pr view` and `gh pr list` for. */
export const PR_FIELDS = "number,url,state,isDraft,statusCheckRollup,headRefOid,headRepository,headRepositoryOwner";

/** The `--json` fields Featra asks `gh pr checks` for. */
export const CHECK_FIELDS = "bucket,name";

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

/**
 * The checks `gh pr checks --json bucket` lists, as one verdict: a failed or cancelled check fails, one still running
 * keeps it pending, and passed or skipped checks pass. Null when the answer isn't a list of checks.
 */
export function bucketsVerdict(raw: unknown): PrChecks | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return "none";
  const buckets = new Set((raw as unknown[]).map((c) => (isRecord(c) ? upper(c.bucket) : "")));
  if (buckets.has("FAIL") || buckets.has("CANCEL")) return "failing";
  return [...buckets].every((b) => b === "PASS" || b === "SKIPPING") ? "passing" : "pending";
}

/** `owner/name` of the repository at a GitHub remote URL (https, ssh, or a path that names github.com), lower case. */
export function githubRepoOf(remoteUrl: string): string | null {
  const m = /github\.com[:/]+([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(remoteUrl.trim());
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

/** `owner/name` of a PR's head repository as `gh` (or the REST answer) gives it, lower case; null when not given. */
function headRepoOf(raw: Record<string, unknown>): string | null {
  const owner = isRecord(raw.headRepositoryOwner) ? raw.headRepositoryOwner.login : undefined;
  const name = isRecord(raw.headRepository) ? raw.headRepository.name : undefined;
  if (typeof owner === "string" && typeof name === "string") return `${owner}/${name}`.toLowerCase();
  const rest = isRecord(raw.head) && isRecord(raw.head.repo) ? raw.head.repo.full_name : undefined;
  return typeof rest === "string" ? rest.toLowerCase() : null;
}

/** The commit a PR's head is at, as `gh` (or the REST answer) gives it; null when not given. */
function headOidOf(raw: Record<string, unknown>): string | null {
  const oid = typeof raw.headRefOid === "string" ? raw.headRefOid : isRecord(raw.head) ? raw.head.sha : undefined;
  return typeof oid === "string" && /^[0-9a-f]{7,64}$/i.test(oid) ? oid.toLowerCase() : null;
}

export interface ReadPr {
  number: number;
  url: string;
  status: PrStatus;
  /** The commit the PR's head is at, when `gh` said. */
  head: string | null;
  /** `owner/name` of the repository the PR's head branch is in, when `gh` said. */
  repo: string | null;
}

/** A PR as `gh pr view --json`, `gh pr list --json` or `gh api …/pulls` answers it; null when it isn't one. */
export function readPr(raw: unknown): ReadPr | null {
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
  const status: PrStatus = { state: prState, checks: checksVerdict(raw.statusCheckRollup) };
  return { number, url, status, head: headOidOf(raw), repo: headRepoOf(raw) };
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

/** What a read of a PR found, for its CI evidence. */
export interface PrRead {
  /** The PR's head isn't the commit the story's branch is at: its checks are for another commit. */
  stale: boolean;
  /** The PR's head moved since the last read: the checks that verified the story were for an older commit. */
  moved: boolean;
  /** The verdict of the checks that count (`bucketsVerdict`, or `checksVerdict` when none are required); null if unread. */
  verdict: PrChecks | null;
}

/**
 * A PR read's CI evidence. Checks for a commit the branch has moved past remove Verified and never grant it; a moved
 * head that hasn't passed yet removes it too. Otherwise passing checks verify, a failing one unverifies, and checks
 * still running change nothing.
 */
export function prCiOutcome({ stale, moved, verdict }: PrRead): CheckOutcome {
  if (stale) return { passed: false, acs: [] };
  const outcome = ciOutcome(verdict ?? "none");
  return outcome.passed === null && moved ? { passed: false, acs: [] } : outcome;
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
