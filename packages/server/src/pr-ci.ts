/**
 * A story PR's CI evidence (STORY-11): the checks that count are the repo's required checks (every reported check
 * when it requires none), and they count only for the commit the story's branch is at. Checks for a commit the
 * branch has moved past remove Verified and never grant it.
 */
import { prCiOutcome, type Card, type CheckOutcome } from "@featra/work-format";
import { branchTip, requiredChecks, type FoundPr, type GithubPrDeps } from "./github-prs.ts";

/** Whether `pr`'s head isn't the commit the story's branch is at in the repository at `dir`; false when unknown. */
export async function headIsStale(dir: string, card: Card, pr: FoundPr, deps: GithubPrDeps = {}): Promise<boolean> {
  if (pr.head === null) return false;
  const tip = await branchTip(dir, card.branch, deps);
  return tip !== null && tip !== pr.head;
}

/** The evidence of a read of `pr`, whose head was `lastHead` at the read before (unknown when undefined). */
export async function ciRead(
  dir: string,
  card: Card,
  pr: FoundPr,
  lastHead: string | null | undefined,
  deps: GithubPrDeps = {},
): Promise<CheckOutcome> {
  const stale = await headIsStale(dir, card, pr, deps);
  const moved = !!lastHead && pr.head !== null && lastHead !== pr.head;
  const required = stale ? null : await requiredChecks(dir, pr.url, deps);
  return prCiOutcome({ stale, moved, verdict: required === "unrequired" ? pr.status.checks : required });
}

/** Removes Verified, and records nothing when it isn't set. */
export const UNVERIFY: CheckOutcome = { passed: false, acs: [] };
