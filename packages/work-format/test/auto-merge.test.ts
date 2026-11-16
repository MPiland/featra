/**
 * STORY-59: when a story merges into its feature on its own. The rules over a card, run for real; only the card data is
 * built here (fixtures.ts calls work-format's own constructors).
 */
import { describe, expect, it } from "vitest";
import {
  acceptedStory,
  autoMergeOn,
  DEFAULT_CONFIG,
  mergedStory,
  mergeRefusal,
  mergesOnItsOwn,
  withCheckEvidence,
  type Card,
  type OwnedCard,
  type OwnerLocation,
} from "../src/index.ts";
import { at, config, moves, story } from "./fixtures.ts";

const TREE: OwnerLocation = { kind: "worktree", branch: "claude/story-1-x", path: "/wt/story-1" };
const ACS = [
  { text: "It opens", done: false, test: "a.test.ts::opens" },
  { text: "It saves", done: false, test: "a.test.ts::saves" },
];
const inReview = (status = "In Review"): Card => ({
  ...moves(story("STORY-1", "FEAT-1"), [1, "In Progress"], [2, status]),
  branch: "claude/story-1-x",
  acs: ACS,
});
/** The card after a check run: `passed` is Verified, `proven` the criteria whose linked test passed. */
const checked = (card: Card, passed: boolean, proven: number[]) =>
  withCheckEvidence(
    card,
    config,
    { passed, acs: proven.map((ac) => ({ ac, passed: true })), head: "abc123" },
    "system",
    at(3),
  );
const owned = (card: Card, extra: Partial<OwnedCard> = {}): OwnedCard => ({
  card,
  owner: TREE,
  shownFrom: TREE,
  path: `.featra/cards/${card.id}.md`,
  ...extra,
});
const ready = () => checked(inReview(), true, [1, 2]);

describe("STORY-59 AC1: a Verified and Proven story merges on its own", () => {
  it("is one Merge would take, Verified and with every criterion proven, with no Accept needed", () => {
    expect(mergeRefusal(owned(ready()), "STORY-1", config, true)).toBeNull();
    expect(mergesOnItsOwn(owned(ready()), config, true, true)).toBe(true);
  });

  it("is still one in Acceptance, and one already Done", () => {
    const waiting = checked(inReview("Acceptance"), true, [1, 2]);
    const done = acceptedStory(waiting, config, "user", at(5));
    expect(done.status).toBe("Done");
    for (const card of [waiting, done]) expect(mergesOnItsOwn(owned(card), config, true, true)).toBe(true);
  });
});

describe("STORY-59 AC2: a story that isn't both Verified and Proven, or that Merge refuses, doesn't", () => {
  it("isn't one that is Verified but not Proven: Merge still takes it", () => {
    const partly = checked(inReview(), true, [1]);
    expect(mergeRefusal(owned(partly), "STORY-1", config, true)).toBeNull();
    expect(mergesOnItsOwn(owned(partly), config, true, true)).toBe(false);
  });

  it("isn't one with no criteria, which is never Proven", () => {
    const bare = checked({ ...inReview(), acs: [] }, true, []);
    expect(mergeRefusal(owned(bare), "STORY-1", config, true)).toBeNull();
    expect(mergesOnItsOwn(owned(bare), config, true, true)).toBe(false);
  });

  it("isn't one that is Proven but not Verified", () => {
    expect(mergesOnItsOwn(owned(checked(inReview(), false, [1, 2])), config, true, true)).toBe(false);
  });

  it("isn't one Merge refuses: not in review yet, merged already, not in its own worktree, or not checked out", () => {
    const early = checked(inReview("In Progress"), true, [1, 2]);
    const merged = mergedStory(ready(), "feature/1-x", "system", at(4));
    const onMain = owned(ready(), { owner: { kind: "main" }, shownFrom: { kind: "main" } });
    for (const [card, writable] of [
      [owned(early), true],
      [owned(merged), true],
      [onMain, true],
      [owned(ready()), false],
    ] as const) {
      expect(mergeRefusal(card, "STORY-1", config, writable)).not.toBeNull();
      expect(mergesOnItsOwn(card, config, writable, true)).toBe(false);
    }
    expect(mergesOnItsOwn(undefined, config, true, true)).toBe(false);
  });

  it("isn't one whose owner copy can't be read: the copy shown may be stale (BUG-24)", () => {
    expect(mergesOnItsOwn(owned(ready(), { ownerUnread: true }), config, true, true)).toBe(false);
  });
});

describe("STORY-59 AC4: auto-merge is a work setting, on by default, with an app default and a project override", () => {
  it("is on in Featra's own defaults", () => {
    expect(DEFAULT_CONFIG.autoMerge).toBe(true);
    expect(autoMergeOn(null, undefined)).toBe(true);
  });

  it("is the project's own value first, else the app default", () => {
    expect(autoMergeOn("version: 1\nautoMerge: false\n", true)).toBe(false);
    expect(autoMergeOn("version: 1\nautoMerge: true\n", false)).toBe(true);
    expect(autoMergeOn("version: 1\n", false)).toBe(false);
    // A config that can't be read sets nothing: the app default applies, and Settings shows the error.
    expect(autoMergeOn("autoMerge: [", false)).toBe(false);
  });

  it("off, nothing merges on its own", () => {
    expect(mergesOnItsOwn(owned(ready()), config, true, false)).toBe(false);
  });
});
