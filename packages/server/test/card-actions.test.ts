import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHANGED_ELSEWHERE, parseCard } from "@featra/work-format";
import { cardViewIn, createCardActions } from "../src/card-actions.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";

/** Card pane edits on a real repository: STORY-1 owned by its worktree off feature/1, STORY-2 owned by main. */
const NOW = new Date("2026-11-05T12:00:00Z");
const git = createRepoGit();
let scanner: ReturnType<typeof createScanner>;
let actions: ReturnType<typeof createCardActions>;
let repo: CardRepo;
let tree: string;
const story1 = card("STORY-1", "story", "FEAT-1", "In Progress", { description: "As a builder, I start." });
const story2 = card("STORY-2", "story", null, "New", { description: "As a builder, I wait." });

beforeEach(async () => {
  scanner = createScanner(git);
  actions = createCardActions({ scan: scanner.scan, now: () => NOW });
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "active"));
  await repo.write(repo.main, story1);
  await repo.write(repo.main, story2);
  repo.commit(repo.main, "plan");
  repo.git(repo.main, "branch", "feature/1");
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

const edit = (id: string, e: Parameters<typeof actions.update>[2]) => actions.update(repo.main, id, e);

describe("card.update writes to the owner copy", () => {
  it("writes a story owned by a worktree to that worktree's file, not main's", async () => {
    const mainBefore = await repo.read(repo.main, "STORY-1");
    const r = await edit("STORY-1", { field: "description", from: story1.description, to: "As a builder, I edit." });
    expect(r).toMatchObject({ ok: true, view: { description: "As a builder, I edit.", owner: "worktree story-1" } });
    expect(parseCard(await repo.read(tree, "STORY-1")).description).toBe("As a builder, I edit.");
    expect(await repo.read(repo.main, "STORY-1")).toBe(mainBefore);
  });

  it("writes a story owned by main to main's file", async () => {
    const r = await edit("STORY-2", { field: "notes", from: "", to: "picked up soon" });
    expect(r).toMatchObject({ ok: true, view: { notes: "picked up soon", owner: "main" } });
    expect(parseCard(await repo.read(repo.main, "STORY-2")).notes).toBe("picked up soon");
  });

  it("writes to the owner even while main has a stale edit of the same card, and leaves that edit alone", async () => {
    await repo.write(repo.main, { ...story1, title: "Stale title in main" });
    const stale = await repo.read(repo.main, "STORY-1");
    const r = await edit("STORY-1", { field: "title", from: "STORY-1", to: "Owner title" });
    expect(r.ok).toBe(true);
    expect(parseCard(await repo.read(tree, "STORY-1")).title).toBe("Owner title");
    expect(await repo.read(repo.main, "STORY-1")).toBe(stale);
  });

  it("appends a status history event at the owner, by the user, on the server's clock", async () => {
    const r = await edit("STORY-1", { field: "status", from: "In Progress", to: "In Review" });
    expect(r).toMatchObject({ ok: true, view: { status: "In Review" } });
    expect(parseCard(await repo.read(tree, "STORY-1")).history.at(-1)).toEqual({
      at: "2026-11-05T12:00:00Z",
      field: "status",
      from: "In Progress",
      to: "In Review",
      by: "user",
    });
  });

  it("leaves no temporary file beside the card", async () => {
    await edit("STORY-2", { field: "notes", from: "", to: "x" });
    const names = await readdir(join(repo.main, ".featra", "cards"));
    expect(names.filter((n) => !n.endsWith(".md"))).toEqual([]);
  });
});

describe("card.update refuses", () => {
  it("an edit from a value the owner no longer has, answering with the current one", async () => {
    await repo.write(tree, { ...story1, description: "Changed in the worktree." });
    const before = await repo.read(tree, "STORY-1");
    const r = await edit("STORY-1", { field: "description", from: story1.description, to: "Mine" });
    expect(r).toMatchObject({ ok: false, error: CHANGED_ELSEWHERE, view: { description: "Changed in the worktree." } });
    expect(await repo.read(tree, "STORY-1")).toBe(before);
  });

  it("a card whose owner isn't checked out: read-only, and no file changes", async () => {
    repo.git(repo.main, "worktree", "remove", "--force", tree);
    repo.git(repo.main, "branch", "-D", "story-1");
    // STORY-1 is now owned by feature/1, which no working tree has checked out.
    const before = await repo.read(repo.main, "STORY-1");
    const view = cardViewIn(await scanner.scan(repo.main), "STORY-1");
    expect(view).toMatchObject({ owner: "feature branch feature/1", readOnly: "Check out feature/1 to edit it." });
    const r = await edit("STORY-1", { field: "title", from: "STORY-1", to: "x" });
    expect(r).toMatchObject({ ok: false, error: "Check out feature/1 to edit it." });
    expect(await repo.read(repo.main, "STORY-1")).toBe(before);
  });

  it("a card that isn't there", async () => {
    expect(await edit("STORY-9", { field: "notes", from: "", to: "x" })).toEqual({
      ok: false,
      error: "That card is gone.",
      view: null,
    });
  });
});

describe("a pane edit of a card a worktree owns (STORY-49)", () => {
  it("appends the by:user content entry to the worktree's copy, and main's file is untouched", async () => {
    const mainBefore = await repo.read(repo.main, "STORY-1");
    const r = await edit("STORY-1", { field: "title", from: story1.title, to: "Renamed in the pane" });
    expect(r).toMatchObject({ ok: true, view: { title: "Renamed in the pane", owner: "worktree story-1" } });
    const mine = parseCard(await repo.read(tree, "STORY-1"));
    expect(mine.history.at(-1)).toMatchObject({ field: "content", to: "title", by: "user" });
    expect(mine.history.at(-1)?.from).toBe(JSON.stringify({ title: story1.title }));
    expect(await repo.read(repo.main, "STORY-1")).toBe(mainBefore);
  });
});
