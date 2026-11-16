import { writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ownedIn } from "../src/card-actions.ts";
import { createCardLane } from "../src/card-lane.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { recordPr } from "../src/story-pr-record.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, moved, type CardRepo } from "./card-repo.ts";

/**
 * BUG-24 review: a card whose owner's file can't be read is shown from the nearest other copy, for display only. No
 * writer may write that copy over the owner's file. A real repository, git and scanner; STORY-1 is In Review in its
 * worktree and still Ready on feature/1.
 */
const NOW = new Date("2026-11-15T12:00:00Z");
const PR = "https://github.com/o/r/pull/7";
let scanner: ReturnType<typeof createScanner>;
let repo: CardRepo;
let tree: string;
const deps = () => ({ scan: scanner.scan, lane: createCardLane(), now: () => NOW });

beforeEach(async () => {
  scanner = createScanner(createRepoGit());
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "active"));
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready"));
  repo.commit(repo.main, "plan");
  repo.git(repo.main, "branch", "feature/1");
  await repo.commitOn(
    "feature/1",
    (t) => repo.write(t, card("FEAT-1", "feature", null, "active", { notes: "started" })),
    "start",
  );
  tree = repo.worktree("story-1", "story-1", "feature/1");
  const ready = card("STORY-1", "story", "FEAT-1", "Ready");
  await repo.write(tree, moved(moved(ready, "In Progress"), "In Review", "2026-11-01T02:00:00Z"));
});

afterEach(async () => {
  await scanner.close();
  await repo.dispose();
});

/** The owner's file mid-write: emptied, as an editor saving leaves it for a moment. */
const emptyOwner = () => writeFile(repo.file(tree, "STORY-1"), "");

describe("card writers, while the owner's copy can't be read (BUG-24 review)", () => {
  it("gives a card shown from another copy no place to write", async () => {
    await emptyOwner();
    const found = ownedIn(await scanner.scan(repo.main), "STORY-1");
    expect(found?.owned).toMatchObject({ ownerUnread: true, card: { status: "Ready" } });
    expect(found?.root).toBeNull();
  });

  it("records no PR over the owner's file", async () => {
    await emptyOwner();
    await recordPr(deps(), repo.main, "STORY-1", PR);
    expect(await repo.read(tree, "STORY-1")).toBe("");
  });

  it("still records the PR at the owner once its file reads again", async () => {
    await recordPr(deps(), repo.main, "STORY-1", PR);
    expect(ownedIn(await scanner.scan(repo.main), "STORY-1")?.owned.card).toMatchObject({
      status: "In Review",
      pr: PR,
    });
  });
});
