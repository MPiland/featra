/**
 * STORY-13: filing a bug. The real filing module, scanner, card lane and work-format rules on a real repository with
 * FEAT-1 in progress on its own branch (not checked out) and STORY-1 being worked in its worktree. Only the clock is
 * faked. There is no GitHub call in filing, so the same holds with or without it.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bugTaskText,
  causeLine,
  parseCard,
  REPORT_BUG_MESSAGES,
  serializeCard,
  type BugReport,
  type Card,
} from "@featra/work-format";
import { createBugFiling, type BugFiling } from "../src/bug-filing.ts";
import { card, cardPath } from "./card-repo.ts";
import { FEATURE_BRANCH, mergeWorld } from "./story-merge-world.ts";

const m = mergeWorld();
const { w } = m;
let bugs: BugFiling;
const CARDS = join(".featra", "cards");

const report = (cause: string | null = null): BugReport => ({
  title: "Saves twice",
  description: "Pressing Save writes two copies.",
  cause,
});
/** A Done feature with a Done story, on main. */
const doneFeature = card("FEAT-0", "feature", null, "done", { title: "Old" });

beforeEach(async () => {
  await w.repo.write(w.repo.main, doneFeature);
  w.repo.commit(w.repo.main, "a done feature");
});

async function start() {
  await m.start({ remote: false });
  bugs = createBugFiling({ scan: w.watches.scan, now: w.clock.now });
}
const file = (placement: string, cause: string | null = null, by = "user") =>
  bugs.file(w.repo.main, report(cause), placement, by);
/** The files named for `id` among `ls` (a tree's cards folder). */
const named = (ls: string[], id: string) => ls.filter((n) => n.startsWith(`${id}-`));
/** The bug card `id` as `branch`'s tip has it. */
function onBranch(branch: string, id: string): Card {
  const names = w.repo.git(w.repo.main, "ls-tree", "--name-only", `${branch}:.featra/cards`).split("\n");
  const name = named(names, id)[0];
  if (!name) throw new Error(`${id} isn't on ${branch}`);
  return parseCard(w.repo.git(w.repo.main, "show", `${branch}:.featra/cards/${name}`));
}
const rows = async () => {
  const list = (await w.watches.scan(w.repo.main))!.list;
  return { list, features: list.epics.flatMap((e) => e.features) };
};

describe("proposing a place (AC2)", { timeout: 60_000 }, () => {
  it.each([
    ["a story still being worked → a task on it", "STORY-1", "task:STORY-1"],
    ["the feature in progress → a bug under it", "FEAT-1", "feature:FEAT-1"],
    ["a Done feature → the project bug list", "FEAT-0", "project"],
    ["no known cause → the project bug list", null, "project"],
  ])("%s", async (_, cause, proposed) => {
    await start();
    const placements = await bugs.propose(w.repo.main, cause);
    expect(placements.proposed).toBe(proposed);
    expect(placements.choices.map((c) => c.key)).toEqual(["feature:FEAT-1", "task:STORY-1", "project"]);
  });

  it("refuses a cause that isn't a card", async () => {
    await start();
    await expect(bugs.propose(w.repo.main, "STORY-404")).rejects.toThrow(REPORT_BUG_MESSAGES.unknownCause("STORY-404"));
  });
});

describe("filing (AC2, AC3)", { timeout: 60_000 }, () => {
  it("commits a bug under the feature in progress on its branch, touching no checkout, as added scope", async () => {
    await start();
    // The feature went in progress at Start (its scope baseline, ADR 0038); the bug comes later.
    await w.moveOn("In Review");
    w.clock.advance(60_000);
    const tip = m.tip(FEATURE_BRANCH);
    const head = w.repo.git(w.repo.main, "rev-parse", "HEAD");
    await expect(file("feature:FEAT-1", "STORY-1", "session:lead-1")).resolves.toEqual({ kind: "card", id: "BUG-1" });
    const bug = onBranch(FEATURE_BRANCH, "BUG-1");
    expect(bug).toMatchObject({ type: "bug", parent: "FEAT-1", status: "New", origin: "bug", title: "Saves twice" });
    expect(bug.description).toContain(causeLine(await w.read()));
    expect(bug.history[0]).toMatchObject({ by: "session:lead-1" });
    // One plumbing commit on the feature branch; main's checkout and HEAD as they were.
    expect(m.parents(w.repo.main, FEATURE_BRANCH)).toEqual([tip]);
    expect(w.repo.git(w.repo.main, "log", "-1", "--format=%s", FEATURE_BRANCH)).toBe("BUG-1: bug filed");
    expect(w.repo.git(w.repo.main, "rev-parse", "HEAD")).toBe(head);
    expect(w.repo.git(w.repo.main, "status", "--porcelain")).toBe("");
    const feat = (await rows()).features.find((f) => f.id === "FEAT-1");
    expect(feat?.stories.find((s) => s.id === "BUG-1")).toMatchObject({ type: "bug", added: true });
    expect(feat?.scope).toMatchObject({ added: 1, openBugs: 1 });
  });

  it("writes a project bug in main's checkout, and Work lists it on the project bug list", async () => {
    await start();
    await expect(file("project")).resolves.toEqual({ kind: "card", id: "BUG-1" });
    const names = named(await readdir(join(w.repo.main, CARDS)), "BUG-1");
    expect(names).toEqual(["BUG-1-saves-twice.md"]);
    const bug = parseCard(await readFile(join(w.repo.main, CARDS, names[0]!), "utf8"));
    expect(bug).toMatchObject({ parent: null, origin: "bug", status: "New" });
    const { list } = await rows();
    expect(list.bugs?.map((b) => b.id)).toEqual(["BUG-1"]);
  });

  it("adds a task to the story in its worktree, with a history event", async () => {
    await start();
    await expect(file("task:STORY-1", "STORY-1")).resolves.toEqual({ kind: "task", id: "STORY-1" });
    const story = parseCard(await readFile(join(w.tree, ...cardPath("STORY-1").split("/")), "utf8"));
    expect(story.tasks.at(-1)).toEqual({ text: bugTaskText("Saves twice"), done: false });
    expect(story.history.at(-1)).toMatchObject({ field: "content", to: "tasks", by: "user" });
    expect(named(await readdir(join(w.tree, CARDS)), "BUG-1")).toEqual([]);
  });

  it("gives each bug an ID no copy has, on any branch", async () => {
    await start();
    await file("feature:FEAT-1");
    await expect(file("project")).resolves.toEqual({ kind: "card", id: "BUG-2" });
  });

  it("files the place the user picked over the proposal", async () => {
    await start();
    expect((await bugs.propose(w.repo.main, "STORY-1")).proposed).toBe("task:STORY-1");
    await expect(file("project", "STORY-1")).resolves.toEqual({ kind: "card", id: "BUG-1" });
    expect(named(await readdir(join(w.repo.main, CARDS)), "BUG-1")).toHaveLength(1);
  });

  it("refuses a place no longer offered, and a cause that isn't a card, writing nothing", async () => {
    await start();
    await w.moveOn("Done");
    await expect(file("task:STORY-1")).rejects.toThrow(REPORT_BUG_MESSAGES.placeGone("task:STORY-1"));
    await expect(file("project", "STORY-404")).rejects.toThrow(REPORT_BUG_MESSAGES.unknownCause("STORY-404"));
    await expect(file("somewhere")).rejects.toThrow(REPORT_BUG_MESSAGES.badPlacement);
    expect(named(await readdir(join(w.repo.main, CARDS)), "BUG-")).toEqual([]);
  });
});

describe("a Done feature stays Done (AC4)", { timeout: 60_000 }, () => {
  it("is never offered, is refused by key, and is left as it was when a bug is blamed on it", async () => {
    await start();
    const before = await w.repo.read(w.repo.main, "FEAT-0");
    const placements = await bugs.propose(w.repo.main, "FEAT-0");
    expect(placements.choices.map((c) => c.key)).not.toContain("feature:FEAT-0");
    await expect(file("feature:FEAT-0", "FEAT-0")).rejects.toThrow(REPORT_BUG_MESSAGES.placeGone("feature:FEAT-0"));
    await expect(file(placements.proposed, "FEAT-0")).resolves.toEqual({ kind: "card", id: "BUG-1" });
    expect(await w.repo.read(w.repo.main, "FEAT-0")).toBe(before);
    expect(before).toBe(serializeCard(doneFeature));
    const { list, features } = await rows();
    expect(features.find((f) => f.id === "FEAT-0")).toMatchObject({ status: "done", stories: [] });
    expect(list.bugs?.map((b) => b.id)).toEqual(["BUG-1"]);
  });
});
