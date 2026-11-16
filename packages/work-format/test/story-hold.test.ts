/**
 * STORY-61: holding a story back from auto-merge. The rules over a card, run for real; only the card data is built here
 * (fixtures.ts calls work-format's own constructors).
 */
import { describe, expect, it } from "vitest";
import {
  buildCardView,
  buildWorkList,
  CANCELLED,
  heldStory,
  holdOf,
  holdRefusal,
  HOLD_MESSAGES,
  isHeld,
  mergedStory,
  mergeRefusal,
  mergesOnItsOwn,
  normalizeCardView,
  normalizeWorkList,
  parseCard,
  serializeCard,
  withCheckEvidence,
  type Card,
  type OwnedCard,
  type OwnerLocation,
} from "../src/index.ts";
import { at, config, feature, moves, story } from "./fixtures.ts";

const TREE: OwnerLocation = { kind: "worktree", branch: "claude/story-1-x", path: "/wt/story-1" };
const HEAD = "abc123";
const AT = { head: HEAD, feature: feature("FEAT-1") };
const off = { ...config, autoMerge: false };
const inReview = (status = "In Review"): Card => ({
  ...moves(story("STORY-1", "FEAT-1"), [1, "In Progress"], [2, status]),
  branch: "claude/story-1-x",
  acs: [{ text: "It opens", done: false, test: "a.test.ts::opens" }],
});
/** Verified and Proven at HEAD: a story auto-merge takes. */
const ready = () =>
  withCheckEvidence(inReview(), config, { passed: true, acs: [{ ac: 1, passed: true }], head: HEAD }, "system", at(3));
const owned = (card: Card, extra: Partial<OwnedCard> = {}): OwnedCard => ({
  card,
  owner: TREE,
  shownFrom: TREE,
  path: `.featra/cards/${card.id}.md`,
  ...extra,
});
const held = (card: Card) => heldStory(card, true, "user", at(4));
const rows = (cards: OwnedCard[], cfg = config) =>
  buildWorkList({ cards, stale: [], problems: [] }, cfg).epics.flatMap((e) => e.features.flatMap((f) => f.stories));

describe("STORY-61 AC1: Hold is a toggle on a story while auto-merge is on, each turn in its history", () => {
  it("holds with a held event by the user, and lets go with one back to null", () => {
    const on = held(inReview());
    expect(isHeld(on)).toBe(true);
    expect(on.history.at(-1)).toEqual({ at: at(4), field: "held", from: null, to: "held", by: "user" });
    const back = heldStory(on, false, "user", at(5));
    expect(isHeld(back)).toBe(false);
    expect(back.history.at(-1)).toEqual({ at: at(5), field: "held", from: "held", to: null, by: "user" });
    expect(isHeld(heldStory(back, true, "user", at(6)))).toBe(true);
  });

  it("is a no-op when the story already is held or let go, and keeps every other field", () => {
    const on = held(inReview());
    expect(heldStory(on, true, "user", at(5))).toBe(on);
    const plain = inReview();
    expect(heldStory(plain, false, "user", at(5))).toBe(plain);
    expect({ ...on, history: [] }).toEqual({ ...plain, history: [] });
  });

  it("survives the card file", () => {
    expect(isHeld(parseCard(serializeCard(held(inReview()))))).toBe(true);
  });

  it("applies to a started story in any stage with a writable owner copy while auto-merge is on", () => {
    for (const status of ["Ready", "In Progress", "In Review", "Acceptance"]) {
      expect(holdRefusal(owned(inReview(status)), "STORY-1", config, true)).toBeNull();
    }
    expect(holdOf(owned(inReview()), config, true)).toBe(false);
    expect(holdOf(owned(held(inReview())), config, true)).toBe(true);
  });

  it("is refused, both ways, when auto-merge is off, the story is merged or cancelled, or isn't one, or can't be written", () => {
    const merged = mergedStory(ready(), "feature/1-x", "system", at(5));
    const cancelled = moves(inReview(), [3, CANCELLED]);
    const onMain = owned(inReview("Ready"), { owner: { kind: "main" }, shownFrom: { kind: "main" } });
    expect(holdRefusal(onMain, "STORY-1", config, true)).toBe("STORY-1 isn't started yet.");
    expect(holdOf(onMain, config, true)).toBeUndefined();
    expect(holdRefusal(undefined, "STORY-1", config, true)).toBe(HOLD_MESSAGES.gone);
    expect(holdRefusal(owned(inReview()), "STORY-1", off, true)).toBe(HOLD_MESSAGES.off);
    expect(holdRefusal(owned(held(inReview())), "STORY-1", off, true)).toBe(HOLD_MESSAGES.off);
    expect(holdRefusal(owned(merged), "STORY-1", config, true)).toBe("STORY-1 is already merged.");
    expect(holdRefusal(owned(cancelled), "STORY-1", config, true)).toBe("STORY-1 is cancelled.");
    expect(holdRefusal(owned({ ...inReview(), type: "bug" }), "STORY-1", config, true)).toBe("STORY-1 isn't a story.");
    expect(holdRefusal(owned(inReview()), "STORY-1", config, false)).toBe(HOLD_MESSAGES.readOnly);
    expect(holdRefusal(owned(inReview(), { ownerUnread: true }), "STORY-1", config, true)).toBe(HOLD_MESSAGES.readOnly);
    for (const [card, cfg] of [
      [inReview(), off],
      [merged, config],
      [cancelled, config],
    ] as const) {
      expect(holdOf(owned(card), cfg, true)).toBeUndefined();
    }
  });
});

describe("STORY-61 AC2: a held story never merges on its own, and Merge still takes it", () => {
  it("isn't picked by auto-merge though Verified and Proven, while Merge doesn't refuse it", () => {
    const card = held(ready());
    expect(mergesOnItsOwn(owned(card), config, true, true, AT)).toBe(false);
    expect(mergeRefusal(owned(card), "STORY-1", config, true)).toBeNull();
  });
});

describe("STORY-61 AC3: a story let go that is Verified and Proven merges on its own again", () => {
  it("is picked once Hold is turned off", () => {
    expect(mergesOnItsOwn(owned(ready()), config, true, true, AT)).toBe(true);
    const back = heldStory(held(ready()), false, "user", at(5));
    expect(mergesOnItsOwn(owned(back), config, true, true, AT)).toBe(true);
  });
});

describe("STORY-61 AC4: Hold shows on the story's row and card, so a held story is easy to spot", () => {
  it("marks the row held, the toggle off on others, and leaves it out while auto-merge is off", () => {
    const cards = [owned(held(inReview())), owned({ ...inReview(), id: "STORY-2" })];
    expect(rows(cards).map((r) => [r.id, r.held])).toEqual([
      ["STORY-1", true],
      ["STORY-2", false],
    ]);
    expect(rows(cards, off).map((r) => r.held)).toEqual([undefined, undefined]);
    const sent = normalizeWorkList(
      JSON.parse(JSON.stringify(buildWorkList({ cards, stale: [], problems: [] }, config))),
    );
    expect(sent?.epics.flatMap((e) => e.features.flatMap((f) => f.stories)).map((r) => r.held)).toEqual([true, false]);
  });

  it("leaves it out of the row of a story whose copy can't be written here", () => {
    const list = buildWorkList({ cards: [owned(held(inReview()))], stale: [], problems: [] }, config, () => false);
    expect(list.epics.flatMap((e) => e.features.flatMap((f) => f.stories))[0]?.held).toBeUndefined();
  });

  it("shows on the card view, and survives the wire", () => {
    const card = held(inReview());
    const view = buildCardView(owned(card), true, { config, cards: [card] });
    expect(view.held).toBe(true);
    expect(normalizeCardView(JSON.parse(JSON.stringify(view)))?.held).toBe(true);
    expect(buildCardView(owned(card), true, { config: off, cards: [card] }).held).toBeUndefined();
  });
});
