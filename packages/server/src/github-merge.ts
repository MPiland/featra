/**
 * Merging a story's PR on GitHub (STORY-12, ADR 0034): always a merge commit, never squash or rebase, and only at the
 * commit Featra checked (`--match-head-commit`), so a push that lands meanwhile makes GitHub refuse rather than merge
 * unchecked work. The branch is deleted by Featra afterwards with git, not by `gh --delete-branch`, which also changes
 * local checkouts.
 */
import { githubPrUrl } from "@featra/work-format";
import { ghJson, runGh } from "./gh-run.ts";
import { because, ghOptions, type GithubPrDeps } from "./github-prs.ts";

/** What GitHub says of a PR's mergeability: `CONFLICTING` is a conflict; `UNKNOWN` while it is still working it out. */
export type Mergeable = "MERGEABLE" | "CONFLICTING" | "UNKNOWN";

/** Whether the PR at `url` merges cleanly, as GitHub has it; null when `gh` couldn't say. */
export async function prMergeable(dir: string, url: string, deps: GithubPrDeps = {}): Promise<Mergeable | null> {
  const safe = githubPrUrl(url);
  if (!safe) return null;
  const answer = await ghJson(dir, ["pr", "view", safe, "--json", "mergeable"], ghOptions(deps));
  const value = answer && typeof answer === "object" && "mergeable" in answer ? answer.mergeable : null;
  return value === "MERGEABLE" || value === "CONFLICTING" || value === "UNKNOWN" ? value : null;
}

/** What GitHub says when a PR's merge commit can't be made cleanly. */
const CONFLICT = /cannot be cleanly created|merge conflict/i;

/**
 * GitHub's own reason for refusing a merge, as one sentence: `gh`'s failure mark (`X`, `✗`) and its "Pull request
 * <repo>#<n> is not mergeable:" prefix dropped, so "X Pull request acme/app#1 is not mergeable: the base branch policy
 * prohibits the merge." is "The base branch policy prohibits the merge." Null when `gh` said nothing.
 */
export function githubReason(said: string): string | null {
  const line = said
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return null;
  const reason = line
    .replace(/^(?:X|✗|×)\s+/u, "")
    .replace(/^Pull request \S+ is not mergeable:\s*/i, "")
    .trim();
  if (!reason) return null;
  const sentence = reason.charAt(0).toUpperCase() + reason.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

/** A sentence as the end of another: its first word lowercased, unless that is a name such as GitHub. */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/**
 * Merges the PR at `url` with a merge commit, at `head` only. Null once merged; else that it conflicts, or why not:
 * `refused` when GitHub answered and refused it (STORY-60), not when `gh` couldn't be asked, with GitHub's `reason`.
 */
export async function mergePr(
  dir: string,
  url: string,
  head: string,
  deps: GithubPrDeps = {},
): Promise<null | { conflict: true } | { error: string; refused: boolean; reason?: string }> {
  const safe = githubPrUrl(url);
  if (!safe || !/^[0-9a-f]{7,64}$/.test(head)) return { error: "Couldn't merge the PR.", refused: false };
  const r = await runGh(dir, ["pr", "merge", safe, "--merge", "--match-head-commit", head], ghOptions(deps));
  if (!r) return { error: "Couldn't merge the PR.", refused: false };
  if (r.code === 0) return null;
  const said = r.stderr || r.stdout;
  if (CONFLICT.test(said)) return { conflict: true };
  const reason = githubReason(said);
  if (!reason) return { error: "Couldn't merge the PR.", refused: true };
  return { error: `Couldn't merge the PR: ${lowerFirst(reason)}`, refused: true, reason };
}

/**
 * Closes the PR at `url` without merging it (STORY-58), with fixed args: its branch is deleted by Featra with git, as
 * after a merge. Null once closed; else why not.
 */
export async function closePr(dir: string, url: string, deps: GithubPrDeps = {}): Promise<null | { error: string }> {
  const safe = githubPrUrl(url);
  if (!safe) return { error: "Couldn't close the PR." };
  const r = await runGh(dir, ["pr", "close", safe], ghOptions(deps));
  if (!r) return { error: "Couldn't close the PR." };
  return r.code === 0 ? null : { error: because("Couldn't close the PR", r.stderr || r.stdout) };
}
