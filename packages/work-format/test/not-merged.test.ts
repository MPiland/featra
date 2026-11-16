/**
 * STORY-60: an automatic merge that didn't happen, as the card records it and the card pane and the Work row show it.
 * The rules run for real; only the card data is built here (fixtures.ts calls work-format's own constructors).
 */
import { describe, expect, it } from "vitest";
import {
  buildCardView,
  buildWorkList,
  checkedEvent,
  MAIN,
  MERGE_COPY,
  mergedStory,
  normalizeCardView,
  normalizeWorkList,
  notMergedOf,
  notMergedStory,
  notMergedSummary,
  recordEvidence,
  setStatus,
  type Card,
  type OwnedCard,
} from "../src/index.ts";
import { at, config, feature, moves, story } from "./fixtures.ts";

const HEAD = "abc123";
const WHY = "Couldn't merge the PR: the base branch policy prohibits the merge.";
const inReview = (): Card => ({
  ...moves(story("STORY-1", "FEAT-1"), [1, "In Progress"], [2, "In Review"]),
  branch: "claude/story-1-x",
});
const refused = (card = inReview(), head = HEAD, why = WHY) => notMergedStory(card, head, why, "system", at(3));

describe("STORY-60: the not-merged record", () => {
  it("is a history event by system, from the commit tried, to why", () => {
    expect(refused().history.at(-1)).toEqual({ at: at(3), field: "not-merged", from: HEAD, to: WHY, by: "system" });
    expect(notMergedOf(refused())).toEqual({ head: HEAD, reason: WHY });
  });

  it("is absent from a story that never failed to merge on its own", () => {
    expect(notMergedOf(inReview())).toBeNull();
  });

  it("stands when the story moves between stages, and when its checks settle again on the commit tried", () => {
    const moved = setStatus(refused(), "Acceptance", "user", at(4));
    expect(notMergedOf(moved)?.reason).toBe(WHY);
    const again = recordEvidence(refused(), checkedEvent(HEAD), "system", at(4));
    expect(notMergedOf(again)?.reason).toBe(WHY);
  });

  it("goes when its checks settle on another commit, or it merges", () => {
    expect(notMergedOf(recordEvidence(refused(), checkedEvent("def456"), "system", at(4)))).toBeNull();
    expect(notMergedOf(mergedStory(refused(), "feature/1-x", "user", at(4)))).toBeNull();
  });

  it("is the latest one when a story fails to merge on its own again", () => {
    const later = refused(recordEvidence(refused(), checkedEvent("def456"), "system", at(4)), "def456", "Later.");
    expect(notMergedOf(later)).toEqual({ head: "def456", reason: "Later." });
  });

  it("is told to the Dev Lead with the feature branch, as the merged notice is", () => {
    expect(notMergedSummary("feature/1-x", WHY)).toBe(`feature/1-x, on its own. ${WHY}`);
  });
});

describe("STORY-60 AC4: the card pane and the Work row carry why", () => {
  const worktree = { kind: "worktree" as const, branch: "claude/story-1-x", path: "/wt/story-1" };
  const owned = (card: Card, owner: OwnedCard["owner"] = worktree): OwnedCard => ({
    card,
    owner,
    shownFrom: owner,
    path: ".featra/cards/x.md",
  });
  const view = (card: Card) => buildCardView(owned(card), true, { config, cards: [feature("FEAT-1"), card] });
  const rowOf = (card: Card) => {
    const resolution = { cards: [feature("FEAT-1", "active", null), card].map((c) => owned(c, MAIN)) };
    const list = buildWorkList({ ...resolution, stale: [], problems: [] }, config);
    return normalizeWorkList(JSON.parse(JSON.stringify(list))).epics[0]?.features[0]?.stories[0];
  };

  it("is in the card's view, through the socket, while it stands", () => {
    const shown = normalizeCardView(JSON.parse(JSON.stringify(view(refused()))));
    expect(shown?.notMerged).toBe(WHY);
    expect(view(inReview()).notMerged).toBeUndefined();
    expect(view(recordEvidence(refused(), checkedEvent("def456"), "system", at(4))).notMerged).toBeUndefined();
  });

  it("is on the story's row, through the socket, which its session reads", () => {
    expect(rowOf(refused())?.notMerged).toBe(WHY);
    expect(rowOf(inReview())?.notMerged).toBeUndefined();
  });

  it("reads as one short line", () => {
    expect(MERGE_COPY.notMerged(WHY)).toBe(`Didn't merge on its own. ${WHY}`);
  });
});
