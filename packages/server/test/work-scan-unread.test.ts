import { mkdir, rm, writeFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { WorkList } from "@featra/work-format";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, moved, type CardRepo } from "./card-repo.ts";

/**
 * An owner copy that can't be read is never a deleted card (BUG-24 AC1). STORY-1 is owned by its worktree, which has
 * committed it In Progress; its feature branch has it Ready. A writer outside Featra empties the owner's file before it
 * writes the new text, and on Windows a file being written can't be opened at all: either way the story stays shown,
 * from the copy nearest the work, with the read problem listed.
 */
let repo: CardRepo;
let tree: string;
let owned: string;
const scanner = createScanner(createRepoGit());
const story = moved(card("STORY-1", "story", "FEAT-1", "Ready"), "In Progress");

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "active"));
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready"));
  repo.commit(repo.main, "plan");
  repo.git(repo.main, "branch", "feature/1");
  await repo.commitOn(
    "feature/1",
    (t) => repo.write(t, card("STORY-1", "story", "FEAT-1", "Ready", { title: "On the feature branch" })),
    "start",
  );
  tree = repo.worktree("claude/story-1-work", "story-1", "feature/1");
  await repo.write(tree, story);
  repo.commit(tree, "start STORY-1");
  owned = repo.file(tree, "STORY-1");
});

afterEach(async () => {
  await rm(owned, { recursive: true, force: true });
  await repo.write(tree, story);
});

afterAll(async () => {
  await scanner.close();
  await repo.dispose();
});

const storyOf = (list: WorkList) =>
  list.epics.flatMap((e) => e.features.flatMap((f) => f.stories)).find((s) => s.id === "STORY-1");

const OWNER = "worktree claude/story-1-work";
const seen = async () => {
  const list = await scanner.list(repo.main);
  return { story: storyOf(list), problems: list.problems };
};
const FROM_FEATURE = {
  story: expect.objectContaining({ title: "On the feature branch", stage: "Ready" }),
  problems: [
    expect.stringMatching(/^Can't read \.featra\/cards\/STORY-1-card\.md in worktree claude\/story-1-work: /),
    `STORY-1 can't be read in its owner (${OWNER}); showing feature branch feature/1.`,
  ],
};

describe("an owner copy that can't be read (BUG-24 AC1)", () => {
  it("is never taken as deleted when the file is empty: the feature branch's copy shows", async () => {
    await writeFile(owned, "");
    expect(await seen()).toEqual(FROM_FEATURE);
  });

  it("is never taken as deleted when the file can't be parsed", async () => {
    await writeFile(owned, "---\nid: STORY-1\ntitle: [half written\n");
    expect(await seen()).toEqual(FROM_FEATURE);
  });

  it("is never taken as deleted when the file can't be opened", async () => {
    // A folder at the card's path fails the read the way a file locked by its writer does on Windows.
    await rm(owned);
    await mkdir(owned);
    expect(await seen()).toEqual(FROM_FEATURE);
  });

  it("still hides a card its owner really deleted (STORY-58)", async () => {
    await rm(owned);
    const list = await scanner.list(repo.main);
    expect(storyOf(list)).toBeUndefined();
    expect(list.problems).toEqual([]);
  });
});

describe("a worktree whose folder is gone (BUG-25)", () => {
  it("is no failure: the scan goes on without it", async () => {
    const gone = await cardRepo();
    const own = createScanner(createRepoGit());
    try {
      await gone.write(gone.main, card("FEAT-1", "feature", null, "active"));
      await gone.write(gone.main, card("STORY-2", "story", "FEAT-1", "Ready"));
      gone.commit(gone.main, "plan");
      const folder = gone.worktree("claude/story-2-work", "story-2");
      // Removed under git's feet, as a merge's cleanup or the user can: git still lists it.
      await rm(folder, { recursive: true, force: true });
      const scan = await own.scan(gone.main);
      expect(scan?.collected.git.trees.map((t) => t.path)).toContain(folder);
      expect(scan?.list.problems).toEqual([]);
      expect(scan?.list.epics.flatMap((e) => e.features.map((f) => f.id))).toEqual(["FEAT-1"]);
    } finally {
      // The scanner keeps the repository's index open, and Windows deletes no open file.
      await own.close();
      await gone.dispose();
    }
  });
});
