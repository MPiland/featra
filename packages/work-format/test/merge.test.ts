/**
 * STORY-12: merging a story into its feature. The rules over a card, run for real; only the card data is built here
 * (fixtures.ts calls work-format's own constructors).
 */
import { describe, expect, it } from "vitest";
import {
  acceptedStory,
  buildCardView,
  buildWorkList,
  conflictedStory,
  conflictMessage,
  fileList,
  isMerged,
  MAIN,
  MERGE_MESSAGES,
  mergedStory,
  mergeRefusal,
  messageRefusal,
  MESSAGE_MESSAGES,
  normalizeCardView,
  normalizeWorkList,
  parseCard,
  parseRequestMergeInput,
  recordEvidence,
  REQUEST_MERGE_MESSAGES,
  resumeRefusal,
  serializeCard,
  STOP_MESSAGES,
  type Card,
  type OwnedCard,
  type OwnerLocation,
} from "../src/index.ts";
import { at, config, moves, story } from "./fixtures.ts";

const TREE: OwnerLocation = { kind: "worktree", branch: "claude/story-1-x", path: "/wt/story-1" };
const inReview = (): Card => ({
  ...moves(story("STORY-1", "FEAT-1"), [1, "In Progress"], [2, "In Review"]),
  branch: "claude/story-1-x",
});
const verified = (card: Card) => recordEvidence(card, "verified", "system", at(3));
const owned = (card: Card, owner: OwnerLocation = TREE): OwnedCard => ({
  card,
  owner,
  shownFrom: owner,
  path: `.featra/cards/${card.id}.md`,
});

describe("when a story can merge (AC1)", () => {
  it("is a Verified story in review in its own worktree, with no Accept needed", () => {
    expect(mergeRefusal(owned(verified(inReview())), "STORY-1", config, true)).toBeNull();
  });

  it("is still one in Acceptance, accepted or not, and one already Done", () => {
    const waiting = verified(moves(inReview(), [4, "Acceptance"]));
    const done = acceptedStory(waiting, config, "user", at(5));
    expect(done.status).toBe("Done");
    for (const card of [waiting, done]) expect(mergeRefusal(owned(card), "STORY-1", config, true)).toBeNull();
  });

  it("needs Verified, said plainly", () => {
    expect(mergeRefusal(owned(inReview()), "STORY-1", config, true)).toBe(MERGE_MESSAGES.notVerified("STORY-1"));
    const unverified = recordEvidence(verified(inReview()), "unverified", "system", at(4));
    expect(mergeRefusal(owned(unverified), "STORY-1", config, true)).toBe(MERGE_MESSAGES.notVerified("STORY-1"));
  });

  it.each(["New", "In Progress"])("refuses a story in %s, before review", (stage) => {
    const card = verified({ ...moves(story("STORY-1", "FEAT-1"), [1, stage]), branch: "b" });
    expect(mergeRefusal(owned(card), "STORY-1", config, true)).toBe(MERGE_MESSAGES.notReady("STORY-1", stage));
  });

  it("refuses a story with no worktree, one already merged, a copy that isn't checked out, and a bug", () => {
    const card = verified(inReview());
    const feature: OwnerLocation = { kind: "feature", branch: "feature/1-x" };
    expect(mergeRefusal(owned(card, feature), "STORY-1", config, true)).toBe(MERGE_MESSAGES.noWorktree("STORY-1"));
    expect(mergeRefusal(owned(card, MAIN), "STORY-1", config, true)).toBe(MERGE_MESSAGES.noWorktree("STORY-1"));
    const merged = mergedStory(card, "feature/1-x", "system", at(5));
    expect(mergeRefusal(owned(merged), "STORY-1", config, true)).toBe(MERGE_MESSAGES.merged("STORY-1"));
    expect(mergeRefusal(owned(card), "STORY-1", config, false)).toBe(MERGE_MESSAGES.readOnly);
    expect(mergeRefusal(undefined, "STORY-1", config, true)).toBe(MERGE_MESSAGES.gone);
    const bug = verified({ ...inReview(), type: "bug" });
    expect(mergeRefusal(owned(bug), "STORY-1", config, true)).toBe(MERGE_MESSAGES.notStory("STORY-1"));
  });

  it("shows Merge on the Work row and the card view only where it applies, and survives the socket", () => {
    const cards = [verified(inReview()), { ...inReview(), id: "STORY-2" }];
    const all = cards.map((c) => owned(c));
    const list = buildWorkList({ cards: all, stale: [], problems: [] }, config);
    const rows = list.epics.flatMap((e) => e.features.flatMap((f) => f.stories));
    expect(rows.map((r) => [r.id, r.mergeable, r.merged])).toEqual([
      ["STORY-1", true, false],
      ["STORY-2", false, false],
    ]);
    expect(normalizeWorkList(JSON.parse(JSON.stringify(list)))).toEqual(list);
    const view = (o: OwnedCard, checkedOut = true) => buildCardView(o, checkedOut, { config, cards });
    expect(view(all[0] as OwnedCard).mergeable).toBe(true);
    expect(view(all[1] as OwnedCard).mergeable).toBeUndefined();
    expect(normalizeCardView(JSON.parse(JSON.stringify(view(all[0] as OwnedCard))))?.mergeable).toBe(true);
  });

  it("is not offered on a row whose card can't be edited here", () => {
    const list = buildWorkList({ cards: [owned(verified(inReview()))], stale: [], problems: [] }, config, () => false);
    expect(list.epics.flatMap((e) => e.features.flatMap((f) => f.stories.map((s) => s.mergeable)))).toEqual([false]);
  });
});

describe("the merged fact (AC5)", () => {
  it("is recorded once, from the story's branch into the feature branch, and reads back from the file", () => {
    const card = mergedStory(verified(inReview()), "feature/1-x", "system", at(5));
    expect(card.history.at(-1)).toEqual({
      at: at(5),
      field: "merged",
      from: "claude/story-1-x",
      to: "feature/1-x",
      by: "system",
    });
    expect(mergedStory(card, "feature/1-x", "system", at(6))).toBe(card);
    const back = parseCard(serializeCard(card), "STORY-1-x.md");
    expect(isMerged(back)).toBe(true);
  });

  it("shows on the row and the card, which then offer no Merge", () => {
    const card = mergedStory(verified(inReview()), "feature/1-x", "system", at(5));
    const feature: OwnerLocation = { kind: "feature", branch: "feature/1-x" };
    const list = buildWorkList({ cards: [owned(card, feature)], stale: [], problems: [] }, config);
    const row = list.epics.flatMap((e) => e.features.flatMap((f) => f.stories))[0];
    expect([row?.merged, row?.mergeable]).toEqual([true, false]);
    const view = buildCardView(owned(card, feature), true, { config, cards: [card] });
    expect([view.merged, view.mergeable]).toEqual([true, undefined]);
  });

  it("leaves the session as history: no Resume and no Dev Lead message", () => {
    const card = mergedStory(verified(inReview()), "feature/1-x", "system", at(5));
    const turn = { running: false, queued: false, stalled: true };
    expect(resumeRefusal(card, "review", turn)).toBe(STOP_MESSAGES.merged("STORY-1"));
    const session = { running: false, queued: false, lead: "lead" };
    expect(messageRefusal(card, "review", "STORY-1", session, "lead")).toBe(MESSAGE_MESSAGES.merged("STORY-1"));
  });
});

describe("a merge that conflicts (AC4)", () => {
  it("returns the story to the first active stage, by system", () => {
    const card = conflictedStory(verified(moves(inReview(), [4, "Acceptance"])), config, "system", at(5));
    expect(card.status).toBe("In Progress");
    expect(card.history.at(-1)).toMatchObject({ field: "status", from: "Acceptance", to: "In Progress", by: "system" });
  });

  it("tells the session each conflicting file, and what to do", () => {
    const text = conflictMessage("STORY-1", "feature/1-x", ["a.ts", "src/b.ts"]);
    expect(text).toContain("Merging STORY-1 into feature/1-x stopped on conflicts, so nothing was merged.");
    expect(text).toContain("- a.ts\n- src/b.ts");
    expect(text).toContain("Merge feature/1-x into your branch");
    expect(conflictMessage("STORY-1", "f", [])).not.toContain("These files conflict");
  });

  it("names a few files and counts the rest", () => {
    expect(fileList(["a", "b"])).toBe("a, b");
    expect(fileList(["1", "2", "3", "4", "5", "6", "7"])).toBe("1, 2, 3, 4, 5 and 2 more");
    expect(MERGE_MESSAGES.conflict("STORY-1", ["a"], "In Progress")).toBe(
      "Nothing was merged: a conflict. STORY-1 is back in In Progress, and its session has the files.",
    );
  });
});

describe("request_merge input (AC3)", () => {
  it("takes a story id, in any case", () => {
    expect(parseRequestMergeInput({ story: " story-4 " })).toEqual({ ok: true, value: { story: "STORY-4" } });
  });

  it.each([{}, { story: "FEAT-1" }, { story: 4 }, null])("refuses %j", (input) => {
    expect(parseRequestMergeInput(input)).toEqual({ ok: false, error: REQUEST_MERGE_MESSAGES.badStory });
  });
});
