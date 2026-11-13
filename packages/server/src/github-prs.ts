/**
 * What Featra asks of git and GitHub for a story's PR (STORY-11): push the branch, find the open PR for it, open one,
 * and read one again. Pushes never force. The PR's title and body come from the card, so they go to `gh` on standard
 * input as JSON, never on the command line (ADR 0031).
 */
import {
  bucketsVerdict,
  CHECK_FIELDS,
  githubPrUrl,
  PR_FIELDS,
  readPr,
  safeBranch,
  type PrChecks,
  type ReadPr,
} from "@featra/work-format";
import { ghJson, runGh, type GhOptions } from "./gh-run.ts";
import type { GithubRemote } from "./github-detect.ts";
import { runGit } from "./git-run.ts";

export interface GithubPrDeps {
  gitCommand?: string;
  ghCommand?: string;
  ghTimeoutMs?: number;
}

export type FoundPr = ReadPr;

/** What the card says when a step fails. Short, and the first line of what git or `gh` said, when it said one. */
export const PR_NOTES = {
  branch: "The story's branch name can't be pushed safely.",
  push: "Couldn't push the story's branch",
  open: "Couldn't open the PR",
} as const;

/** The line that says why: git's `error:` or `fatal:` line when there is one, else the first. */
function why(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.find((l) => /^(error|fatal):/.test(l)) ?? lines[0] ?? "";
}
export const because = (what: string, said: string) => (why(said) ? `${what}: ${why(said)}` : `${what}.`);
export const ghOptions = (deps: GithubPrDeps): GhOptions => ({ gh: deps.ghCommand, timeoutMs: deps.ghTimeoutMs });

/**
 * Pushes the story's branch from its worktree to the project's GitHub remote, and first the feature branch when the
 * remote doesn't have it yet (the PR needs its base there). Never forced. Null once pushed, else why not.
 */
export async function pushStory(
  worktree: string,
  remote: GithubRemote,
  base: string,
  branch: string,
  { gitCommand = "git" }: GithubPrDeps = {},
): Promise<string | null> {
  if (!safeBranch(base) || !safeBranch(branch)) return PR_NOTES.branch;
  const has = await runGit(gitCommand, worktree, ["ls-remote", "--exit-code", "--heads", remote.name, base]);
  if (has.code === 2) {
    const ref = `refs/heads/${base}`;
    const pushed = await runGit(gitCommand, worktree, ["push", remote.name, `${ref}:${ref}`]);
    if (pushed.code !== 0) return because(PR_NOTES.push, pushed.stderr);
  } else if (has.code !== 0) return because(PR_NOTES.push, has.stderr);
  const pushed = await runGit(gitCommand, worktree, ["push", "-u", remote.name, branch]);
  return pushed.code === 0 ? null : because(PR_NOTES.push, pushed.stderr);
}

/** The commit `branch` is at in the repository at `dir`; null when there is no such branch. */
export async function branchTip(dir: string, branch: string | null, { gitCommand = "git" }: GithubPrDeps = {}) {
  if (!safeBranch(branch)) return null;
  const r = await runGit(gitCommand, dir, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
  const oid = r.stdout.trim().toLowerCase();
  return r.code === 0 && /^[0-9a-f]{7,64}$/.test(oid) ? oid : null;
}

/**
 * The open PR from `branch` into `base` in the project's own repository (a fork's branch of the same name isn't it),
 * when there is one; undefined when `gh` couldn't tell.
 */
export async function openPrFor(
  dir: string,
  pr: { head: string; base: string; repo: string },
  deps: GithubPrDeps = {},
): Promise<FoundPr | null | undefined> {
  if (!safeBranch(pr.head) || !safeBranch(pr.base)) return undefined;
  const args = ["pr", "list", "--head", pr.head, "--base", pr.base, "--state", "open", "--json", PR_FIELDS];
  const answer = await ghJson(dir, args, ghOptions(deps));
  if (!Array.isArray(answer)) return undefined;
  return answer.map(readPr).find((found) => found?.repo === pr.repo) ?? null;
}

/**
 * The verdict of the repo's required checks on the PR at `url`: `unrequired` when the repo requires none, null when
 * `gh` couldn't say. `gh pr checks` exits non-zero while checks fail or run, so its JSON is read whatever the exit.
 */
export async function requiredChecks(
  dir: string,
  url: string,
  deps: GithubPrDeps = {},
): Promise<PrChecks | "unrequired" | null> {
  const safe = githubPrUrl(url);
  if (!safe) return null;
  const r = await runGh(dir, ["pr", "checks", safe, "--required", "--json", CHECK_FIELDS], ghOptions(deps));
  if (!r) return null;
  if (/no required checks reported/i.test(r.stderr)) return "unrequired";
  try {
    return bucketsVerdict(JSON.parse(r.stdout));
  } catch {
    return null;
  }
}

/** Opens a PR from `head` into `base`; the PR, or why it couldn't. */
export async function createPr(
  dir: string,
  pr: { base: string; head: string; title: string; body: string },
  deps: GithubPrDeps = {},
): Promise<FoundPr | string> {
  const args = ["api", "repos/{owner}/{repo}/pulls", "--method", "POST", "--input", "-"];
  const r = await runGh(dir, args, { ...ghOptions(deps), input: JSON.stringify(pr) });
  if (!r) return `${PR_NOTES.open}.`;
  if (r.code !== 0) return because(PR_NOTES.open, r.stderr || r.stdout);
  try {
    return readPr(JSON.parse(r.stdout)) ?? `${PR_NOTES.open}.`;
  } catch {
    return `${PR_NOTES.open}.`;
  }
}

/** The PR at `url` as GitHub has it now; null when it isn't a GitHub PR or `gh` couldn't read it. */
export async function readPrAt(dir: string, url: string, deps: GithubPrDeps = {}): Promise<FoundPr | null> {
  const safe = githubPrUrl(url);
  if (!safe) return null;
  return readPr(await ghJson(dir, ["pr", "view", safe, "--json", PR_FIELDS], ghOptions(deps)));
}
