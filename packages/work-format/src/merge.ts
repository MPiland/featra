/**
 * Merging a story into its feature branch (STORY-12, ADR 0034): pure rules over the card. A story can merge once it is
 * Verified, from review on (Accept gates Done, not the merge, and an accepted, Verified story may be Done first), while
 * its work is still in its own worktree. The merge is a fact in the card's history (`merged`, from the story's branch to
 * the feature branch), written by `system` on the feature branch's copy, which owns the card from then on.
 */
import { activeStage } from "./acceptance.ts";
import { checksApply } from "./checks.ts";
import { stageCategory } from "./config.ts";
import { evidenceState } from "./evidence.ts";
import { appendHistory, isMerged, setStatus } from "./history.ts";
import { parseId } from "./ids.ts";
import type { OwnedCard } from "./owner-copies.ts";
import { resumedStory } from "./story-stop.ts";
import type { Card, ProjectConfig } from "./types.ts";
import { isRecord } from "./utils/guards.ts";

/** The longest list of files a refusal names before it says how many more there are. */
const LISTED = 5;

/** `files` as one short list: the first few, then how many more. */
export function fileList(files: readonly string[]): string {
  const shown = files.slice(0, LISTED).join(", ");
  return files.length > LISTED ? `${shown} and ${files.length - LISTED} more` : shown;
}

export const MERGE_MESSAGES = {
  gone: "That card is gone.",
  notStory: (id: string) => `${id} isn't a story.`,
  merged: (id: string) => `${id} is already merged.`,
  noWorktree: (id: string) => `${id} has no worktree to merge.`,
  noFeature: (id: string) => `${id} has no feature branch to merge into.`,
  readOnly: "Can't edit it here.",
  notReady: (id: string, status: string) => `${id} is ${status}. A story merges from review on.`,
  notVerified: (id: string) => `${id} isn't Verified.`,
  merging: (id: string) => `${id} is already merging.`,
  working: (id: string) => `${id} is working. Stop it or wait for its turn to end.`,
  dirty: (id: string, files: readonly string[]) =>
    `${id} has uncommitted changes: ${fileList(files)}. Commit them first.`,
  stale: (id: string) => `${id}'s checks haven't passed on its latest commit yet.`,
  noPr: (id: string) => `${id} has no PR. Open its PR first.`,
  prClosed: (id: string) => `${id}'s PR is closed.`,
  targetBusy: (branch: string) => `${branch} has local changes in the way. Commit or stash them, then merge again.`,
  failed: "Couldn't merge",
  conflict: (id: string, files: readonly string[], stage: string) =>
    files.length > 0
      ? `Nothing was merged: ${fileList(files)} conflict. ${id} is back in ${stage}, and its session has the files.`
      : `Nothing was merged: the merge conflicts. ${id} is back in ${stage}, and its session was told.`,
} as const;

/** From review to Acceptance, or Done already: an accepted, Verified story can be Done before it merges. */
function readyStage(card: Card, config: ProjectConfig): boolean {
  return checksApply(card, config) || stageCategory(card.status, config) === "done";
}

/**
 * Why story `id` can't merge, or null when it can. `writable` says whether its owner copy is checked out, which the
 * merge writes. The feature branch it merges into and the commit its evidence is for are the server's to check.
 */
export function mergeRefusal(
  owned: OwnedCard | undefined,
  id: string,
  config: ProjectConfig,
  writable: boolean,
): string | null {
  const card = owned?.card;
  if (!owned || !card) return MERGE_MESSAGES.gone;
  if (card.type !== "story") return MERGE_MESSAGES.notStory(id);
  if (isMerged(card)) return MERGE_MESSAGES.merged(id);
  if (owned.owner.kind !== "worktree") return MERGE_MESSAGES.noWorktree(id);
  if (!writable) return MERGE_MESSAGES.readOnly;
  if (!readyStage(card, config)) return MERGE_MESSAGES.notReady(id, card.status);
  if (!evidenceState(card).verified) return MERGE_MESSAGES.notVerified(id);
  return null;
}

/** The card with its merge recorded, once: from the story's branch, into `into`. */
export function mergedStory(card: Card, into: string, by: string, at: string): Card {
  if (isMerged(card)) return card;
  return appendHistory(card, { at, field: "merged", from: card.branch, to: into, by });
}

/**
 * The story after a merge that conflicted: back in the first active stage, where its session resolves it. Its session
 * is told the files, so a Stopped mark is cleared, as a send-back clears it.
 */
export const conflictedStory = (card: Card, config: ProjectConfig, by: string, at: string): Card =>
  setStatus(resumedStory(card, by, at), activeStage(config) ?? card.status, by, at);

/** What the story's session is told when its merge conflicted. */
export function conflictMessage(id: string, into: string, files: readonly string[]): string {
  const head = `Merging ${id} into ${into} stopped on conflicts, so nothing was merged.`;
  const how = `Merge ${into} into your branch, resolve the conflicts, commit, and move the story back to review.`;
  if (files.length === 0) return `${head} ${how}`;
  return [`${head} These files conflict:`, ...files.map((f) => `- ${f}`), "", how].join("\n");
}

/** The merge commit's message. */
export const mergeCommitMessage = (card: Pick<Card, "id" | "title">): string => `Merge ${card.id}: ${card.title}`;

export const REQUEST_MERGE_MESSAGES = {
  badStory: "Give the story's id, such as STORY-9, as `story`.",
  notLead: (id: string) => `Only the Dev Lead that started ${id} can ask to merge it.`,
  waiting: (id: string) => `A merge of ${id} is already waiting for the user.`,
  asked: (id: string) =>
    `Asked the user to merge ${id}. A notice tells you when they approve or decline it, and how the merge went.`,
} as const;

/** A `request_merge` call: the story to merge. */
export interface RequestMergeInput {
  story: string;
}

export function parseRequestMergeInput(
  input: unknown,
): { ok: true; value: RequestMergeInput } | { ok: false; error: string } {
  const raw = isRecord(input) ? input : {};
  const story = (typeof raw.story === "string" ? raw.story.trim() : "").toUpperCase();
  if (parseId(story)?.prefix !== "STORY") return { ok: false, error: REQUEST_MERGE_MESSAGES.badStory };
  return { ok: true, value: { story } };
}
