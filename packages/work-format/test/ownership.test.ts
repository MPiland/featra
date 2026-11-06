import { describe, expect, it } from "vitest";
import { MAIN, locationLabel, ownerOf, sameLocation, type BranchState } from "../src/index.ts";

const none: BranchState = { features: {}, worktrees: {} };
const started: BranchState = { features: { "FEAT-1": { branch: "feat/1", merged: false } }, worktrees: {} };
const working: BranchState = {
  ...started,
  worktrees: { "STORY-1": { branch: "feat/1-story-1", path: "/wt/story-1", merged: false } },
};
const storyMerged: BranchState = {
  ...started,
  worktrees: { "STORY-1": { branch: "feat/1-story-1", path: "/wt/story-1", merged: true } },
};
const featureMerged: BranchState = {
  features: { "FEAT-1": { branch: "feat/1", merged: true } },
  worktrees: { "STORY-1": { branch: "feat/1-story-1", path: "/wt/story-1", merged: true } },
};

const epic = { id: "EPIC-1", type: "epic", parent: null } as const;
const feat = { id: "FEAT-1", type: "feature", parent: "EPIC-1" } as const;
const story = { id: "STORY-1", type: "story", parent: "FEAT-1" } as const;
const sibling = { id: "STORY-2", type: "story", parent: "FEAT-1" } as const;
const featureBug = { id: "BUG-1", type: "bug", parent: "FEAT-1" } as const;
const projectBug = { id: "BUG-2", type: "bug", parent: null } as const;

const FEATURE_BRANCH = { kind: "feature", branch: "feat/1" } as const;
const WORKTREE = { kind: "worktree", branch: "feat/1-story-1", path: "/wt/story-1" } as const;

describe("ownerOf (ADR 0002 table)", () => {
  it.each([
    ["draft/backlog feature", feat, none, MAIN],
    ["draft/backlog story", story, none, MAIN],
    ["epic, always", epic, working, MAIN],
    ["active feature", feat, started, FEATURE_BRANCH],
    ["story of an active feature, not yet spawned", sibling, working, FEATURE_BRANCH],
    ["active story", story, working, WORKTREE],
    ["story after its merge", story, storyMerged, FEATURE_BRANCH],
    ["feature after merge to main", feat, featureMerged, MAIN],
    ["story after feature merge", story, featureMerged, MAIN],
    ["bug under an active feature", featureBug, started, FEATURE_BRANCH],
    ["project bug", projectBug, started, MAIN],
  ])("%s", (_, card, state, expected) => {
    expect(ownerOf(card, state)).toEqual(expected);
  });

  it("a project bug being fixed in its own worktree is owned by that worktree", () => {
    const state: BranchState = {
      features: {},
      worktrees: { "BUG-2": { branch: "bug-2", path: "/wt/bug-2", merged: false } },
    };
    expect(ownerOf(projectBug, state)).toEqual({ kind: "worktree", branch: "bug-2", path: "/wt/bug-2" });
  });
});

describe("locations", () => {
  it("compares and labels", () => {
    expect(sameLocation(MAIN, { kind: "main" })).toBe(true);
    expect(sameLocation(FEATURE_BRANCH, WORKTREE)).toBe(false);
    expect(sameLocation(WORKTREE, { ...WORKTREE })).toBe(true);
    expect(locationLabel(WORKTREE)).toBe("worktree feat/1-story-1");
  });
});
