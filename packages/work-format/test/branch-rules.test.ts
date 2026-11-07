import { describe, expect, it } from "vitest";
import { branchStateOf, featureIdOfBranch, itemIdOfBranch, type BranchFacts } from "../src/index.ts";

const facts = (over: Partial<BranchFacts>): BranchFacts => ({
  baseBranch: "main",
  worktrees: [{ path: "/repo", branch: "main" }],
  branches: [{ name: "main", inBase: true }],
  cardBranches: new Map(),
  ...over,
});

describe("featureIdOfBranch", () => {
  it.each([
    ["feature/7", "FEAT-7"],
    ["feature/7-work-list", "FEAT-7"],
    ["feature/007", "FEAT-7"],
    ["feature/7x", null],
    ["features/7", null],
    ["claude/feature/7", null],
    ["main", null],
  ])("%s → %s", (branch, id) => {
    expect(featureIdOfBranch(branch)).toBe(id);
  });
});

describe("itemIdOfBranch", () => {
  it.each([
    ["claude/story-2-init-86a6bd", "STORY-2"],
    ["story-2", "STORY-2"],
    ["Story-2-x", "STORY-2"],
    ["fix/BUG-4", "BUG-4"],
    ["claude/story-24-x", "STORY-24"],
    ["story-2x", null],
    ["my-story-2", null],
    ["claude/stories-2", null],
  ])("%s → %s", (branch, id) => {
    expect(itemIdOfBranch(branch)).toBe(id);
  });

  it("story-2 never matches story-24", () => {
    expect(itemIdOfBranch("claude/story-24-list")).not.toBe("STORY-2");
  });
});

describe("branchStateOf", () => {
  it("an unmerged feature branch is active; one in base with no worktree is merged", () => {
    const s = branchStateOf(
      facts({
        branches: [
          { name: "main", inBase: true },
          { name: "feature/1", inBase: false },
          { name: "feature/2-old", inBase: true },
        ],
      }),
    );
    expect(s.features).toEqual({
      "FEAT-1": { branch: "feature/1", merged: false },
      "FEAT-2": { branch: "feature/2-old", merged: true },
    });
  });

  it("a branch made at base with no commits reads as merged (its cards are base's)", () => {
    const s = branchStateOf(facts({ branches: [{ name: "feature/3", inBase: true }] }));
    expect(s.features["FEAT-3"]).toEqual({ branch: "feature/3", merged: true });
  });

  it("a feature branch checked out in a worktree is never merged", () => {
    const s = branchStateOf(
      facts({
        worktrees: [
          { path: "/repo", branch: "main" },
          { path: "/wt/f3", branch: "feature/3" },
        ],
        branches: [{ name: "feature/3", inBase: true }],
      }),
    );
    expect(s.features["FEAT-3"]?.merged).toBe(false);
    expect(s.worktrees).toEqual({});
  });

  it("finds a story worktree by its branch name; a live worktree is never merged", () => {
    const s = branchStateOf(
      facts({
        worktrees: [
          { path: "/repo", branch: "main" },
          { path: "/wt/s2", branch: "claude/story-2-init" },
        ],
      }),
    );
    expect(s.worktrees).toEqual({ "STORY-2": { branch: "claude/story-2-init", path: "/wt/s2", merged: false } });
  });

  it("the card's branch field wins over the name rule", () => {
    const s = branchStateOf(
      facts({
        worktrees: [
          { path: "/wt/a", branch: "claude/story-5-a" },
          { path: "/wt/b", branch: "odd-name" },
        ],
        cardBranches: new Map([["STORY-5", ["odd-name"]]]),
      }),
    );
    expect(s.worktrees["STORY-5"]).toEqual({ branch: "odd-name", path: "/wt/b", merged: false });
  });

  it("a worktree claimed by one card's branch field isn't given to another by name", () => {
    const s = branchStateOf(
      facts({
        worktrees: [{ path: "/wt/x", branch: "claude/story-6-x" }],
        cardBranches: new Map([["STORY-7", ["claude/story-6-x"]]]),
      }),
    );
    expect(Object.keys(s.worktrees)).toEqual(["STORY-7"]);
  });

  it("ignores detached worktrees, the base branch and feature branches for story lookup", () => {
    const s = branchStateOf(
      facts({
        worktrees: [
          { path: "/repo", branch: "main" },
          { path: "/wt/d", branch: null },
          { path: "/wt/f", branch: "feature/9" },
        ],
        cardBranches: new Map([["STORY-1", ["main"]]]),
      }),
    );
    expect(s.worktrees).toEqual({});
  });
});
