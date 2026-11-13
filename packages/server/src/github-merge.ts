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

/** Merges the PR at `url` with a merge commit, at `head` only. Null once merged; else that it conflicts, or why not. */
export async function mergePr(
  dir: string,
  url: string,
  head: string,
  deps: GithubPrDeps = {},
): Promise<null | { conflict: true } | { error: string }> {
  const safe = githubPrUrl(url);
  if (!safe || !/^[0-9a-f]{7,64}$/.test(head)) return { error: "Couldn't merge the PR." };
  const r = await runGh(dir, ["pr", "merge", safe, "--merge", "--match-head-commit", head], ghOptions(deps));
  if (!r) return { error: "Couldn't merge the PR." };
  if (r.code === 0) return null;
  const said = r.stderr || r.stdout;
  return CONFLICT.test(said) ? { conflict: true } : { error: because("Couldn't merge the PR", said) };
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
