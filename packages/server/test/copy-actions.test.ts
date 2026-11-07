import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCard } from "@featra/work-format";
import { createCopyActions } from "../src/copy-actions.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardPath, cardRepo, moved, type CardRepo } from "./card-repo.ts";

/** Apply and discard on a real repository: STORY-1 owned by its worktree, with copies edited in main (AC6). */
const NOW = new Date("2026-11-05T12:00:00Z");
const git = createRepoGit();
let scanner: ReturnType<typeof createScanner>;
let actions: ReturnType<typeof createCopyActions>;
let repo: CardRepo;
let tree: string;
const KEY = `main|${cardPath("STORY-1")}`;
const base = card("STORY-1", "story", "FEAT-1", "Ready");

beforeEach(async () => {
  scanner = createScanner(git);
  actions = createCopyActions({ git, scanner, now: () => NOW });
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "active"));
  await repo.write(repo.main, base);
  repo.commit(repo.main, "plan");
  repo.git(repo.main, "branch", "feature/1");
  // FEAT-1 starts on its branch, so its stories are owned there (a branch with no commits would read as merged).
  await repo.commitOn(
    "feature/1",
    (t) => repo.write(t, card("FEAT-1", "feature", null, "active", { notes: "started" })),
    "start",
  );
  tree = repo.worktree("story-1", "story-1", "feature/1");
});

afterEach(async () => {
  await scanner.close();
  await repo.dispose();
});

const committedMain = () => repo.show(repo.main, "HEAD", "STORY-1");
const status = () => repo.git(repo.main, "status", "--porcelain");

describe("apply to owner", () => {
  it("copies the edit to the owner's file and restores the copy from git", async () => {
    await repo.write(repo.main, { ...base, title: "Better title", notes: "from main" });
    expect(await actions.apply(repo.main, KEY)).toEqual({ ok: true });
    expect(parseCard(await repo.read(tree, "STORY-1"))).toEqual({ ...base, title: "Better title", notes: "from main" });
    expect(await repo.read(repo.main, "STORY-1")).toBe(committedMain());
    expect(status()).toBe("");
    expect((await scanner.list(repo.main)).stale).toEqual([]);
  });

  it("records a status change at the owner, by the user, on the server's clock", async () => {
    await repo.write(repo.main, moved(base, "In Progress"));
    expect(await actions.apply(repo.main, KEY)).toEqual({ ok: true });
    const owner = parseCard(await repo.read(tree, "STORY-1"));
    expect(owner.status).toBe("In Progress");
    expect(owner.history.at(-1)).toEqual({
      at: "2026-11-05T12:00:00Z",
      field: "status",
      from: "Ready",
      to: "In Progress",
      by: "user",
    });
  });

  it("refuses when the owner changed the same field, and touches neither file", async () => {
    await repo.write(tree, { ...base, title: "Owner's title" });
    await repo.write(repo.main, { ...base, title: "Copy's title" });
    const ownerBefore = await repo.read(tree, "STORY-1");
    const copyBefore = await repo.read(repo.main, "STORY-1");
    expect(await actions.apply(repo.main, KEY)).toEqual({
      ok: false,
      error: "The owner changed title too. Edit the owner's copy instead.",
    });
    expect(await repo.read(tree, "STORY-1")).toBe(ownerBefore);
    expect(await repo.read(repo.main, "STORY-1")).toBe(copyBefore);
  });

  it("refuses when the owner isn't checked out", async () => {
    repo.git(repo.main, "worktree", "remove", "--force", tree);
    repo.git(repo.main, "branch", "-D", "story-1");
    // STORY-1 is now owned by feature/1, which no working tree has checked out.
    await repo.write(repo.main, { ...base, title: "edited" });
    const before = await repo.read(repo.main, "STORY-1");
    expect(await actions.apply(repo.main, KEY)).toEqual({
      ok: false,
      error: "The owner, feature branch feature/1, isn't checked out. Check it out first.",
    });
    expect(await repo.read(repo.main, "STORY-1")).toBe(before);
  });

  it("answers for a copy that is no longer stale", async () => {
    expect(await actions.apply(repo.main, KEY)).toEqual({ ok: false, error: "That copy has no changes now." });
  });
});

describe("discard", () => {
  it("restores the copy from git HEAD", async () => {
    await repo.write(repo.main, { ...base, title: "throw me away" });
    expect(await actions.discard(repo.main, KEY)).toEqual({ ok: true });
    expect(await repo.read(repo.main, "STORY-1")).toBe(committedMain());
    expect(status()).toBe("");
  });

  it("removes a copy that HEAD doesn't have", async () => {
    const story9 = card("STORY-9", "story", "FEAT-1", "Ready");
    await repo.write(tree, story9);
    await repo.write(repo.main, { ...story9, title: "new in main too" });
    repo.git(repo.main, "add", cardPath("STORY-9"));
    expect(await actions.discard(repo.main, `main|${cardPath("STORY-9")}`)).toEqual({ ok: true });
    expect(existsSync(repo.file(repo.main, "STORY-9"))).toBe(false);
    expect(status()).toBe("");
  });
});
