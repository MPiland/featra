/**
 * STORY-9 (review): a project opened as a linked worktree of its repository. The provider's worktree folder is excluded
 * through the repository's own `info/exclude` (never a path joined onto the linked checkout), and the story starts.
 * Real git and services; only the Agent SDK and the clock are faked.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld({ linked: true });
});
afterAll(() => w.close());

describe("a project that is a linked worktree", () => {
  it("excludes the worktree folder once, in the repository's info/exclude, and starts the story", async () => {
    expect(w.dir).not.toBe(w.repo.main);
    const reply = await w.window.ask("story.start", { dir: w.dir, id: "STORY-5" });
    expect(reply).toMatchObject({ ok: true });
    expect(existsSync(join(w.dir, ".claude", "worktrees", "STORY-5-spawn-five"))).toBe(true);

    const exclude = readFileSync(join(w.repo.main, ".git", "info", "exclude"), "utf8");
    expect(exclude.split(/\r?\n/).filter((l) => l === ".claude/worktrees/")).toHaveLength(1);
    expect(w.repo.git(w.dir, "status", "--porcelain", "--", ".claude")).toBe("");

    expect(await w.window.ask("story.start", { dir: w.dir, id: "STORY-6" })).toMatchObject({ ok: true });
    const again = readFileSync(join(w.repo.main, ".git", "info", "exclude"), "utf8");
    expect(again.split(/\r?\n/).filter((l) => l === ".claude/worktrees/")).toHaveLength(1);
  });
});
