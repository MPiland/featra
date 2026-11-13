import { describe, expect, it } from "vitest";
import {
  MAIN,
  orphans,
  resolveCopies,
  serializeCard,
  type BranchState,
  type Card,
  type CardCopy,
  type OwnerLocation,
} from "../src/index.ts";
import { feature, moves, story } from "./fixtures.ts";

const FB: OwnerLocation = { kind: "feature", branch: "feature/1" };
const WT: OwnerLocation = { kind: "worktree", branch: "claude/story-1", path: "/wt/s1" };
const OTHER_WT: OwnerLocation = { kind: "worktree", branch: "claude/story-2", path: "/wt/s2" };

const active: BranchState = {
  features: { "FEAT-1": { branch: "feature/1", merged: false } },
  worktrees: { "STORY-1": { branch: "claude/story-1", path: "/wt/s1", merged: false } },
};

function copy(location: OwnerLocation, card: Card, opts: Partial<CardCopy> = {}): CardCopy {
  return {
    location,
    path: `.featra/cards/${card.id}-x.md`,
    text: serializeCard(card),
    card,
    error: null,
    workingTree: location.kind !== "feature",
    edited: false,
    ...opts,
  };
}

const s1 = story("STORY-1", "FEAT-1");
const f1 = feature("FEAT-1");

describe("resolveCopies: one owner per card", () => {
  it("shows an active story from its worktree, its feature from the feature branch", () => {
    const inWt = moves(s1, [5, "In Progress"]);
    const r = resolveCopies([copy(MAIN, s1), copy(MAIN, f1), copy(FB, s1), copy(FB, f1), copy(WT, inWt)], active);
    expect(r.cards.find((c) => c.card.id === "STORY-1")).toMatchObject({ card: inWt, owner: WT, shownFrom: WT });
    expect(r.cards.find((c) => c.card.id === "FEAT-1")).toMatchObject({ owner: FB, shownFrom: FB });
    expect(r.cards).toHaveLength(2);
    expect(r.stale).toEqual([]);
  });

  it("a backlog card is owned by main", () => {
    const r = resolveCopies([copy(MAIN, story("STORY-9", null))], { features: {}, worktrees: {} });
    expect(r.cards[0]).toMatchObject({ owner: MAIN, shownFrom: MAIN });
  });

  it("a story moved under an active feature on that branch is owned by the branch", () => {
    const moved = { ...story("STORY-4", null) };
    const onBranch = { ...moved, parent: "FEAT-1" };
    const r = resolveCopies([copy(MAIN, moved), copy(FB, onBranch)], active);
    expect(r.cards[0]).toMatchObject({ card: onBranch, owner: FB });
  });

  it("when the owner has no copy, shows another and says so", () => {
    const r = resolveCopies([copy(MAIN, s1)], active);
    expect(r.cards[0]).toMatchObject({ owner: WT, shownFrom: MAIN });
    expect(r.problems).toEqual([expect.stringContaining("STORY-1 isn't in its owner")]);
  });

  it("finds the cards shown from a copy that isn't their owner's", () => {
    const r = resolveCopies([copy(MAIN, s1), copy(MAIN, f1), copy(FB, f1)], active);
    expect(orphans(r).map((c) => c.card.id)).toEqual(["STORY-1"]);
  });

  it("leaves out a card its owner deleted, however many older copies it left, but flags an edit to one (STORY-58)", () => {
    const copies = [copy(MAIN, s1), copy(OTHER_WT, s1, { edited: true, text: "changed" }), copy(FB, f1)];
    const r = resolveCopies(copies, active, new Set(["STORY-1"]));
    expect(r.cards.map((c) => c.card.id)).toEqual(["FEAT-1"]);
    expect(r.problems).toEqual([]);
    // Review ruling: an uncommitted edit isn't dropped silently (ADR 0002's stale copies).
    expect(r.stale).toEqual([{ cardId: "STORY-1", location: OTHER_WT, path: ".featra/cards/STORY-1-x.md", owner: WT }]);
  });

  it("flags nothing for a deleted card whose older copies are unedited (STORY-58)", () => {
    const r = resolveCopies([copy(MAIN, s1), copy(FB, f1)], active, new Set(["STORY-1"]));
    expect(r.stale).toEqual([]);
  });

  it("reports unreadable working-tree files and duplicate ids", () => {
    const bad: CardCopy = { ...copy(MAIN, s1), card: null, error: "bad yaml", path: ".featra/cards/STORY-1-x.md" };
    const dup = copy(MAIN, f1, { path: ".featra/cards/FEAT-1-y.md" });
    const r = resolveCopies([bad, copy(MAIN, f1), dup], { features: {}, worktrees: {} });
    expect(r.problems).toContain("Can't read .featra/cards/STORY-1-x.md in main: bad yaml");
    expect(r.problems).toContain("FEAT-1 is in two files in main; showing the first.");
  });

  it("reports a file whose name doesn't match the card it holds", () => {
    const r = resolveCopies([copy(MAIN, s1, { path: ".featra/cards/STORY-2-x.md" })], { features: {}, worktrees: {} });
    expect(r.problems).toEqual([".featra/cards/STORY-2-x.md in main holds STORY-1."]);
  });
});

describe("resolveCopies: stale copies", () => {
  it("flags an uncommitted edit in a non-owner working tree that differs from the owner", () => {
    const edited = { ...s1, title: "edited in main" };
    const r = resolveCopies([copy(MAIN, edited, { edited: true }), copy(WT, s1)], active);
    expect(r.stale).toEqual([{ cardId: "STORY-1", location: MAIN, path: ".featra/cards/STORY-1-x.md", owner: WT }]);
  });

  it("doesn't flag a copy matching the owner, even with other line endings", () => {
    const text = serializeCard(s1).replace(/\n/g, "\r\n");
    const r = resolveCopies([copy(OTHER_WT, s1, { edited: true, text }), copy(WT, s1)], active);
    expect(r.stale).toEqual([]);
  });

  it("doesn't flag committed copies, git-object copies, or the owner's own edits", () => {
    const changed = { ...s1, title: "older" };
    const r = resolveCopies(
      [copy(MAIN, changed), copy(FB, changed, { edited: true }), copy(WT, s1, { edited: true })],
      active,
    );
    expect(r.stale).toEqual([]);
  });
});
