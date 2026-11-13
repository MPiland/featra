/**
 * STORY-58: abandoning a story. The rules over a card, its warning's wording, and the counts an abandoned story is
 * left out of, run for real; only the card data is built here (fixtures.ts calls work-format's own constructors).
 */
import { describe, expect, it } from "vitest";
import {
  ABANDON_COPY,
  ABANDON_MESSAGES,
  abandonCommitMessage,
  abandonedStory,
  abandonParams,
  abandonRefusal,
  atRisk,
  buildCardView,
  buildWorkList,
  burnUp,
  CANCELLED,
  featureProgress,
  isMerged,
  MAIN,
  mergedStory,
  normalizeAbandonWarning,
  normalizeCardView,
  parseCard,
  scopeSummary,
  serializeCard,
  warningLines,
  type AbandonWarning,
  type Card,
  type OwnedCard,
  type OwnerLocation,
} from "../src/index.ts";
import { at, config, feature, moves, story } from "./fixtures.ts";

const TREE: OwnerLocation = { kind: "worktree", branch: "claude/story-1-x", path: "/wt/story-1" };
const FEATURE: OwnerLocation = { kind: "feature", branch: "feature/1-x" };
const owned = (card: Card, owner: OwnerLocation = TREE): OwnedCard => ({
  card,
  owner,
  shownFrom: owner,
  path: `.featra/cards/${card.id}.md`,
});
const working = (): Card => ({
  ...moves(story("STORY-1", "FEAT-1"), [1, "In Progress"]),
  branch: "claude/story-1-x",
});

/** The card pane's view of `card`, as the server would send it. */
const view = (card: Card, owner: OwnerLocation, writable = true) =>
  normalizeCardView(buildCardView(owned(card, owner), writable, { config, cards: [card] }));
/** FEAT-1's row on the Work list of `cards`, all on main. */
const rows = (cards: Card[]) =>
  buildWorkList({ cards: cards.map((c) => owned(c, MAIN)), stale: [], problems: [] }, config).epics[0]?.features[0];
const warning = (over: Partial<AbandonWarning> = {}): AbandonWarning => ({
  files: [],
  unpushed: [],
  pr: null,
  branch: "claude/story-1-x",
  remotes: [],
  token: "t",
  ...over,
});

describe("which stories can be abandoned", () => {
  it("is any story that isn't merged or done: new, active, in review, in Acceptance, stopped or not", () => {
    for (const status of ["New", "Ready", "In Progress", "In Review", "Acceptance"]) {
      const card = moves(story("STORY-1", "FEAT-1"), [1, status]);
      for (const owner of [TREE, FEATURE, MAIN]) {
        expect(abandonRefusal(owned(card, owner), "STORY-1", config, true)).toBeNull();
      }
    }
  });

  it("refuses a merged story, a done one, a bug, a feature, and a card that is gone", () => {
    const merged = mergedStory(working(), "feature/1-x", "system", at(2));
    expect(isMerged(merged)).toBe(true);
    expect(abandonRefusal(owned(merged), "STORY-1", config, true)).toBe(ABANDON_MESSAGES.merged("STORY-1"));
    const done = moves(working(), [2, "Done"]);
    expect(abandonRefusal(owned(done), "STORY-1", config, true)).toBe(ABANDON_MESSAGES.done("STORY-1"));
    const bug = story("BUG-1", "FEAT-1", { type: "bug" });
    expect(abandonRefusal(owned(bug), "BUG-1", config, true)).toBe(ABANDON_MESSAGES.notStory("BUG-1"));
    const feat = feature("FEAT-1");
    expect(abandonRefusal(owned(feat), "FEAT-1", config, true)).toBe(ABANDON_MESSAGES.notStory("FEAT-1"));
    expect(abandonRefusal(undefined, "STORY-1", config, true)).toBe(ABANDON_MESSAGES.gone);
  });

  it("refuses a Cancelled story, unless its worktree is still there to remove", () => {
    const cancelled = moves(working(), [2, CANCELLED]);
    expect(abandonRefusal(owned(cancelled, FEATURE), "STORY-1", config, true)).toBe(
      ABANDON_MESSAGES.cancelled("STORY-1"),
    );
    expect(abandonRefusal(owned(cancelled, TREE), "STORY-1", config, true)).toBeNull();
  });

  it("refuses where its owner copy isn't checked out", () => {
    expect(abandonRefusal(owned(working(), FEATURE), "STORY-1", config, false)).toBe(ABANDON_MESSAGES.readOnly);
  });

  it("is offered on the card pane exactly when it is allowed", () => {
    expect(view(working(), TREE)?.abandonable).toBe(true);
    expect(view(moves(working(), [2, "Done"]), TREE)?.abandonable).toBeUndefined();
    expect(view(working(), FEATURE, false)?.abandonable).toBeUndefined();
  });
});

describe("the card kept as Cancelled (AC2)", () => {
  it("is Cancelled, logged in its history by the user, and survives a round trip", () => {
    const kept = abandonedStory(working(), "user", at(5));
    expect(kept.status).toBe(CANCELLED);
    expect(kept.history.at(-1)).toMatchObject({
      field: "status",
      from: "In Progress",
      to: CANCELLED,
      by: "user",
      at: at(5),
    });
    expect(parseCard(serializeCard(kept), ".featra/cards/STORY-1.md").status).toBe(CANCELLED);
  });

  it("is unchanged when it is Cancelled already", () => {
    const cancelled = moves(working(), [2, CANCELLED]);
    expect(abandonedStory(cancelled, "user", at(5))).toBe(cancelled);
  });

  it("names the choice in the commit on the feature branch", () => {
    expect(abandonCommitMessage("STORY-1", true)).toBe("STORY-1: abandoned, kept as Cancelled");
    expect(abandonCommitMessage("STORY-1", false)).toBe("STORY-1: abandoned, card discarded");
  });
});

describe("an abandoned story is left out of counts (AC2)", () => {
  const feat = feature("FEAT-1");
  const done = moves(story("STORY-2", "FEAT-1"), [1, "In Progress"], [3, "Done"]);
  const before = [feat, working(), done];
  const after = [feat, abandonedStory(working(), "user", at(5)), done];

  it("leaves feature progress and scope", () => {
    expect(featureProgress("FEAT-1", before, config)).toMatchObject({ done: 1, total: 2 });
    expect(featureProgress("FEAT-1", after, config)).toMatchObject({ done: 1, total: 1 });
    const bug = story("BUG-1", "FEAT-1", { type: "bug" });
    const scope = scopeSummary("FEAT-1", [...after, bug], config);
    expect(scope.bugs.total).toBe(1);
    expect(scope.added.map((a) => a.id)).not.toContain("STORY-1");
  });

  it("leaves the burn-up's scope from the moment it was abandoned", () => {
    const points = burnUp("FEAT-1", after, config);
    expect(points.at(-1)).toMatchObject({ at: at(5), scope: 1, done: 1 });
    expect(points.some((p) => p.scope === 2)).toBe(true);
  });

  it("leaves the board's counts and bar, and still shows as a Cancelled row", () => {
    expect(rows(after)?.progress).toMatchObject({ done: 1, total: 1 });
    expect(rows(after)?.bar).toEqual([{ tone: "done", count: 1 }]);
    expect(rows(after)?.stories.find((s) => s.id === "STORY-1")).toMatchObject({ stage: CANCELLED, tone: "cancelled" });
  });
});

describe("the warning (AC1)", () => {
  it("names uncommitted files, commits not pushed and the PR it closes, capped, before what always goes", () => {
    const w = warning({
      files: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts", "g.ts"],
      unpushed: ["abc1234 Add a"],
      pr: "https://github.com/o/r/pull/12",
      remotes: ["origin"],
    });
    expect(atRisk(w)).toBe(true);
    const lines = warningLines(w);
    expect(lines.risks).toEqual([
      "7 uncommitted files: a.ts, b.ts, c.ts, d.ts, e.ts and 2 more",
      "1 commit not pushed: abc1234 Add a",
      "PR #12 is closed",
    ]);
    expect(lines.removes).toBe("Its worktree and the branch claude/story-1-x are removed, here and on origin.");
  });

  it("is a plain question when nothing would be lost", () => {
    const w = warning();
    expect(atRisk(w)).toBe(false);
    expect(warningLines(w)).toEqual({
      risks: [],
      removes: "Its worktree and the branch claude/story-1-x are removed.",
    });
    expect(warningLines(warning({ branch: null })).removes).toBe(ABANDON_COPY.cardOnly);
  });

  it("keeps the copy short, in sentence case", () => {
    expect([ABANDON_COPY.abandon, ABANDON_COPY.keep, ABANDON_COPY.discard]).toEqual([
      "Abandon",
      "Keep as Cancelled",
      "Discard card",
    ]);
    expect(ABANDON_COPY.ask("STORY-1")).toBe("Abandon STORY-1?");
  });

  it("is read back from the wire, or refused when it isn't one", () => {
    const w = warning({ files: ["a"], pr: "https://github.com/o/r/pull/1" });
    expect(normalizeAbandonWarning(JSON.parse(JSON.stringify(w)))).toEqual(w);
    expect(normalizeAbandonWarning({ ...w, files: [1] })).toBeNull();
    expect(normalizeAbandonWarning({ ...w, token: undefined })).toBeNull();
    expect(normalizeAbandonWarning(null)).toBeNull();
  });

  it("takes abandon's params only whole", () => {
    expect(abandonParams({ dir: "/p", id: "STORY-1", keep: false, token: "t" })).toEqual({
      dir: "/p",
      id: "STORY-1",
      keep: false,
      token: "t",
    });
    expect(abandonParams({ dir: "/p", id: "STORY-1", keep: "yes", token: "t" })).toBeNull();
    expect(abandonParams({ dir: "/p", id: "STORY-1", keep: true })).toBeNull();
  });
});
