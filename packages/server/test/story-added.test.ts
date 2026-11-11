/**
 * STORY-9 note 3: a story added to a feature after it started lives only where it was written. Starting it writes the card
 * onto the feature branch first (a card-only commit, ADR 0024), so the story's branch is cut from a branch that has it.
 * When the feature branch is checked out somewhere, nothing is committed onto it: the card goes into the new worktree.
 * Also: the exclude line is made once however many stories start. Real git; only the Agent SDK and the clock are faked.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseCard } from "@featra/work-format";
import { story, storyWorld, type StoryWorld } from "./story-fixture.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld();
});
afterAll(() => w.close());

const FEATURE = "feature/2-delegation";
const spawn = (id: string) => w.window.ask("story.start", { dir: w.repo.main, id });
const folder = (name: string) => join(w.repo.main, ".claude", "worktrees", name);
const ancestors = (branch: string) => w.repo.git(w.repo.main, "rev-list", "--count", branch);

describe("note 3: a story added to a started feature", () => {
  it("is committed onto the feature branch by itself, and the story's branch has it", async () => {
    await w.repo.write(w.repo.main, story("STORY-20", "Added later"));
    w.repo.commit(w.repo.main, "add a story");
    expect(() => w.repo.show(w.repo.main, FEATURE, "STORY-20")).toThrow(/STORY-20|exist|fatal/);
    const before = ancestors(FEATURE);

    expect(await spawn("STORY-20")).toMatchObject({ ok: true });

    expect(ancestors(FEATURE)).toBe(String(Number(before) + 1));
    expect(w.repo.git(w.repo.main, "log", "-1", "--format=%s", FEATURE)).toBe("STORY-20: added to FEAT-2");
    expect(w.repo.git(w.repo.main, "diff", "--name-only", `${FEATURE}~1`, FEATURE)).toContain("STORY-20");
    // The feature branch's copy is as written (New); the worktree's copy is the one In Progress.
    expect(parseCard(w.repo.show(w.repo.main, FEATURE, "STORY-20")).status).toBe("New");
    expect(await w.card("STORY-20", folder("STORY-20-added-later"))).toMatchObject({ status: "In Progress" });
  });

  it("is written into the worktree alone when the feature branch is checked out, leaving the branch as it is", async () => {
    await w.repo.write(w.repo.main, story("STORY-21", "Added while open"));
    w.repo.commit(w.repo.main, "add another story");
    const held = join(w.repo.main, "..", "feature-checkout");
    w.repo.git(w.repo.main, "worktree", "add", held, FEATURE);
    const tip = w.repo.git(w.repo.main, "rev-parse", FEATURE);

    expect(await spawn("STORY-21")).toMatchObject({ ok: true });

    expect(w.repo.git(w.repo.main, "rev-parse", FEATURE)).toBe(tip);
    expect(await w.card("STORY-21", folder("STORY-21-added-while-open"))).toMatchObject({ status: "In Progress" });
  });
});

describe("the worktree exclude", () => {
  it("is one line however many stories have started", async () => {
    await spawn("STORY-5");
    await spawn("STORY-6");
    const exclude = readFileSync(join(w.repo.main, ".git", "info", "exclude"), "utf8");
    expect(exclude.split(/\r?\n/).filter((l) => l === ".claude/worktrees/")).toHaveLength(1);
  });
});
