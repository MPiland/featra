/**
 * STORY-16 AC4: the burn-up follows changes nobody committed. A real repository: FEAT-1 is started on its branch, and
 * its story is moved to Done, and a new story written, in the feature's checkout without a commit. The scan reads the
 * owner copies from disk (ADR 0016), so the feature row's burn-up has both. Only the clock in the cards is fixed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorkList } from "@featra/work-format";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, moved, type CardRepo } from "./card-repo.ts";

let repo: CardRepo;
let tree: string;
const scanner = createScanner(createRepoGit());
const STARTED = "2026-11-01T01:00:00Z";

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "approved"));
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "New"));
  await repo.write(repo.main, card("STORY-2", "story", "FEAT-1", "New"));
  repo.commit(repo.main, "plan");
  // Start: the feature's branch says it went in progress, and is checked out in its own folder.
  tree = repo.worktree("feature/1-list", "feature-1");
  await repo.write(tree, moved(card("FEAT-1", "feature", null, "approved"), "active", STARTED));
  repo.commit(tree, "FEAT-1: started");
});

afterAll(async () => {
  await scanner.close();
  await repo.dispose();
});

const burnUpOf = (list: WorkList) => list.epics.flatMap((e) => e.features).find((f) => f.id === "FEAT-1")?.burnUp;

describe("AC4: changes that were never committed still appear in the chart", () => {
  it("has a story moved to Done and a story added in the feature's checkout, with no commit", async () => {
    const before = burnUpOf(await scanner.list(repo.main));
    expect(before).toEqual({ since: STARTED, points: [{ at: STARTED, scope: 2, done: 0 }] });

    await repo.write(tree, moved(card("STORY-1", "story", "FEAT-1", "New"), "Done", "2026-11-01T02:00:00Z"));
    await repo.write(tree, card("STORY-3", "story", "FEAT-1", "New", { created: "2026-11-01T03:00:00Z" }));
    expect(repo.git(tree, "status", "--porcelain")).not.toBe("");

    expect(burnUpOf(await scanner.list(repo.main))?.points).toEqual([
      { at: STARTED, scope: 2, done: 0 },
      { at: "2026-11-01T02:00:00Z", scope: 2, done: 1 },
      { at: "2026-11-01T03:00:00Z", scope: 3, done: 1 },
    ]);
  });
});
