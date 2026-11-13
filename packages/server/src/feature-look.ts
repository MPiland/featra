/**
 * A feature in progress as ending it needs it (STORY-14, ADR 0037): its card read fresh from its owner copy, its branch
 * and the commit that branch is at, and the base branch it merges into. And how its card is written: where its branch
 * is checked out, to the file there, as every card edit is; where it isn't, as a commit made by plumbing onto the
 * commit the scan read (merge-git's `commitCardOn`), so no checkout is touched and nothing committed meanwhile is lost.
 */
import { FEATURE_END_MESSAGES, type Card, type ProjectConfig } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { fileIn, ownedIn, writeAtomic } from "./card-actions.ts";
import { locationKey } from "./collect.ts";
import type { MergeGit } from "./merge-git.ts";
import type { Scan } from "./work-scan.ts";

export interface FeatureLook {
  scan: Scan;
  config: ProjectConfig;
  card: Card;
  /** The card's path in its owner copy. */
  path: string;
  /** The checkout of its branch, or null when none has it. */
  root: string | null;
  branch: string;
  base: string;
  top: string;
  /** The commit its branch is at. */
  tip: string;
}

/** Feature `id` in `scan` with its branch, which it has while it is in progress; null otherwise. */
export async function lookAt(git: MergeGit, scan: Scan | null, id: string): Promise<FeatureLook | null> {
  const found = ownedIn(scan, id);
  if (!scan || !found || found.owned.card.type !== "feature" || found.owned.owner.kind !== "feature") return null;
  const { branch } = found.owned.owner;
  const top = scan.collected.paths.top;
  const tip = await git.commitOf(top, `refs/heads/${branch}`);
  if (!tip) return null;
  return {
    scan,
    config: scan.collected.config,
    card: found.owned.card,
    path: found.owned.path,
    root: found.root,
    branch,
    base: scan.collected.git.baseBranch,
    top,
    tip,
  };
}

/** Writes `text` as the feature's card, as `look` read it; throws, with nothing changed, when the branch can't take it. */
export async function writeFeature(git: MergeGit, look: FeatureLook, text: string, message: string): Promise<void> {
  if (look.root) return writeAtomic(fileIn(look.root, look.path), text);
  const owner = { kind: "feature" as const, branch: look.branch };
  const parent = look.scan.collected.heads.get(locationKey(owner)) ?? null;
  const done = await git.commitCardOn(look.top, look.branch, { path: look.path, text, message }, { parent });
  if (done === "missing") throw new ApiError(FEATURE_END_MESSAGES.noBranch(look.card.id));
  if (done === "busy") throw new ApiError(FEATURE_END_MESSAGES.baseBusy(look.branch));
  if (done === "moved") throw new ApiError(FEATURE_END_MESSAGES.moved(look.branch));
}
