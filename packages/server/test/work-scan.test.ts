import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FeatureRow, WorkList } from "@featra/work-format";
import { indexFile, openCardIndex } from "../src/card-index.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, moved, type CardRepo } from "./card-repo.ts";

/**
 * One real repository that has every ownership case at once (ADR 0002, ADR 0016): main, an active feature branch
 * with no worktree, a story worktree with an uncommitted edit, a merged feature branch, a branch made at main with no
 * commits, a detached worktree, and a stale edit in main.
 */
let repo: CardRepo;
let storyTree: string;
const scanner = createScanner(createRepoGit());

beforeAll(async () => {
  repo = await cardRepo();
  const { main } = repo;
  for (const c of [
    card("EPIC-1", "epic", null, "active"),
    card("FEAT-1", "feature", "EPIC-1", "approved"),
    card("FEAT-2", "feature", "EPIC-1", "draft"),
    card("FEAT-3", "feature", "EPIC-1", "active"),
    card("FEAT-4", "feature", "EPIC-1", "approved"),
    card("STORY-1", "story", "FEAT-1", "Ready"),
    card("STORY-2", "story", "FEAT-1", "Ready"),
    card("STORY-3", "story", "FEAT-2", "New"),
    card("STORY-5", "story", "FEAT-3", "Ready"),
  ]) {
    await repo.write(main, c);
  }
  repo.commit(main, "plan");

  // FEAT-1 starts: its branch, not checked out, says active; its stories move with it.
  repo.git(main, "branch", "feature/1-list");
  const f1 = repo.worktree("tmp-f1", "tmp-f1", "feature/1-list");
  repo.git(f1, "checkout", "-q", "feature/1-list");
  await repo.write(f1, card("FEAT-1", "feature", "EPIC-1", "active", { title: "FEAT-1 on its branch" }));
  await repo.write(f1, card("STORY-2", "story", "FEAT-1", "Ready", { title: "STORY-2 on the branch" }));
  repo.commit(f1, "start FEAT-1");
  repo.git(main, "worktree", "remove", f1);
  repo.git(main, "branch", "-D", "tmp-f1");

  // STORY-1 is being worked on in its own worktree, with an edit not yet committed.
  storyTree = repo.worktree("claude/story-1-work", "story-1", "feature/1-list");
  await repo.write(storyTree, moved(card("STORY-1", "story", "FEAT-1", "Ready"), "In Progress"));

  // FEAT-3 was done on its branch and merged to main (fast-forward), and the branch kept.
  repo.git(main, "checkout", "-q", "-b", "feature/3");
  await repo.write(main, card("FEAT-3", "feature", "EPIC-1", "done"));
  await repo.write(main, moved(card("STORY-5", "story", "FEAT-3", "Ready"), "Done"));
  repo.commit(main, "FEAT-3 done");
  repo.git(main, "checkout", "-q", "main");
  repo.git(main, "merge", "-q", "--ff-only", "feature/3");

  // A branch made at main with no commits of its own reads as merged: its cards are main's.
  repo.git(main, "branch", "feature/4");
  // A detached worktree is nobody's.
  repo.git(main, "worktree", "add", "-q", "--detach", join(repo.root, "detached"), "main");

  // An edit to STORY-1 in main, where it isn't owned.
  await repo.write(main, card("STORY-1", "story", "FEAT-1", "Ready", { title: "edited in main" }));
});

afterAll(async () => {
  await scanner.close();
  await repo.dispose();
});

const feature = (list: WorkList, id: string): FeatureRow | undefined =>
  list.epics.flatMap((e) => e.features).find((f) => f.id === id);
const storyOf = (list: WorkList, id: string) =>
  list.epics.flatMap((e) => e.features.flatMap((f) => f.stories)).find((s) => s.id === id);

describe("the Work list from owner copies (STORY-3 AC4)", () => {
  it("shows each card once, from its owner, across worktrees and branches", async () => {
    const scan = await scanner.scan(repo.main);
    const owners = Object.fromEntries(scan?.resolution.cards.map((c) => [c.card.id, c.owner]) ?? []);
    expect(owners).toEqual({
      "EPIC-1": { kind: "main" },
      "FEAT-1": { kind: "feature", branch: "feature/1-list" },
      "FEAT-2": { kind: "main" },
      "FEAT-3": { kind: "main" },
      "FEAT-4": { kind: "main" },
      "STORY-1": { kind: "worktree", branch: "claude/story-1-work", path: storyTree },
      "STORY-2": { kind: "feature", branch: "feature/1-list" },
      "STORY-3": { kind: "main" },
      "STORY-5": { kind: "main" },
    });
    expect(scan?.list.problems).toEqual([]);
  });

  it("reads the owner's content: a branch from git, a worktree from disk", async () => {
    const list = await scanner.list(repo.main);
    expect(feature(list, "FEAT-1")).toMatchObject({ title: "FEAT-1 on its branch", status: "active" });
    expect(storyOf(list, "STORY-2")?.title).toBe("STORY-2 on the branch");
    expect(storyOf(list, "STORY-1")).toMatchObject({ title: "STORY-1", stage: "In Progress" });
    expect(feature(list, "FEAT-3")).toMatchObject({ status: "done", progress: { label: "1 of 1 story done" } });
  });

  it("gives the same list from any worktree of the repository", async () => {
    expect(await scanner.list(storyTree)).toEqual(await scanner.list(repo.main));
  });

  it("flags the edit in main as a stale copy of the worktree's card (STORY-3 AC6)", async () => {
    const list = await scanner.list(repo.main);
    expect(list.stale).toEqual([
      {
        key: "main|.featra/cards/STORY-1-card.md",
        cardId: "STORY-1",
        where: "main",
        owner: "worktree claude/story-1-work",
        path: ".featra/cards/STORY-1-card.md",
      },
    ]);
  });

  it("is an empty list for a folder outside git or without .featra", async () => {
    expect(await scanner.list(repo.root)).toEqual({ epics: [], stale: [], problems: [] });
  });
});

const file = () => indexFile(join(repo.main, ".git"));

describe("the index (ADR 0012)", () => {
  it("lives in the git common dir and holds the owners the scan resolved", async () => {
    await scanner.scan(storyTree);
    expect(existsSync(file())).toBe(true);
    const index = openCardIndex(file());
    try {
      expect(index.owners().find((o) => o.cardId === "STORY-1")).toEqual({
        cardId: "STORY-1",
        type: "story",
        parent: "FEAT-1",
        status: "In Progress",
        owner: `worktree:${storyTree}`,
        path: ".featra/cards/STORY-1-card.md",
      });
    } finally {
      index.close();
    }
  });

  it("is rebuilt when corrupt, and the list is the same", async () => {
    const before = await scanner.list(repo.main);
    await scanner.close();
    await writeFile(file(), "this is not a database");
    expect(await scanner.list(repo.main)).toEqual(before);
    await scanner.close();
  });

  it("close waits for a scan in flight, so nothing holds the index file after", async () => {
    const running = scanner.scan(repo.main);
    await scanner.close();
    await running;
    await rm(file());
    expect(existsSync(file())).toBe(false);
  });
});
