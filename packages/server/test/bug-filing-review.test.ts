/**
 * STORY-13 review fixes (PR #46): filing a bug where a branch is or isn't checked out, an ID taken meanwhile, and a
 * branch that moved between the scan and the write. The real filing module, scanner and work-format rules on a real
 * repository: FEAT-1 in progress on its own branch, STORY-1 being worked in its worktree. Only the clock is faked.
 */
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCard, readOnlyReason, REPORT_BUG_MESSAGES, type BugReport, type Card } from "@featra/work-format";
import { BUG_MESSAGES, createBugFiling, type BugFiling, type BugFilingDeps } from "../src/bug-filing.ts";
import { card } from "./card-repo.ts";
import { FEATURE_BRANCH, mergeWorld } from "./story-merge-world.ts";

const m = mergeWorld();
const { w } = m;
let bugs: BugFiling;
const CARDS = join(".featra", "cards");
const BASE = "main";

const report = (cause: string | null = null): BugReport => ({ title: "Saves twice", description: "", cause });

async function start(scan: BugFilingDeps["scan"] = w.watches.scan) {
  await m.start({ remote: false });
  bugs = createBugFiling({ scan, now: w.clock.now });
}
const file = (placement: string, cause: string | null = null) =>
  bugs.file(w.repo.main, report(cause), placement, "user");
/** The card files on `branch`'s tip whose names start with `prefix`. */
const onBranch = (branch: string, prefix: string) =>
  w.repo
    .git(w.repo.main, "ls-tree", "--name-only", `${branch}:.featra/cards`)
    .split("\n")
    .filter((n) => n.startsWith(prefix));
const show = (branch: string, name: string): Card =>
  parseCard(w.repo.git(w.repo.main, "show", `${branch}:.featra/cards/${name}`));
const onDisk = async (tree: string, prefix: string) =>
  (await readdir(join(tree, CARDS))).filter((n) => n.startsWith(prefix));
/** A file named as a card with `id` that isn't one, so no scan knows the ID but the folder has it. */
const broken = (tree: string, id: string) => writeFile(join(tree, CARDS, `${id}-broken.md`), "not a card\n");

describe("a story its feature branch owns, with no worktree (review 2a, ruling 7)", { timeout: 60_000 }, () => {
  it("is offered the feature bug, not a task, and a task on it is refused", async () => {
    await start();
    const story2 = card("STORY-2", "story", "FEAT-1", "In Progress");
    await w.repo.commitOn(FEATURE_BRANCH, (tree) => w.repo.write(tree, story2), "STORY-2 in progress");
    const tip = m.tip(FEATURE_BRANCH);
    const placements = await bugs.propose(w.repo.main, "STORY-2");
    expect(placements.proposed).toBe("feature:FEAT-1");
    expect(placements.choices.map((c) => c.key)).not.toContain("task:STORY-2");
    await expect(file("task:STORY-2", "STORY-2")).rejects.toThrow(REPORT_BUG_MESSAGES.placeGone("task:STORY-2"));
    expect(m.tip(FEATURE_BRANCH)).toBe(tip);
  });
});

describe("where the owner is or isn't checked out (review 2b, 2c)", { timeout: 60_000 }, () => {
  it("commits a project bug on main by plumbing when main isn't checked out", async () => {
    await start();
    w.repo.git(w.repo.main, "checkout", "-q", FEATURE_BRANCH);
    const tip = m.tip(BASE);
    await expect(file("project")).resolves.toEqual({ kind: "card", id: "BUG-1" });
    expect(onBranch(BASE, "BUG-1")).toEqual(["BUG-1-saves-twice.md"]);
    expect(show(BASE, "BUG-1-saves-twice.md")).toMatchObject({ type: "bug", parent: null, status: "New" });
    expect(m.parents(w.repo.main, BASE)).toEqual([tip]);
    // The folder has the feature branch out, and is left as it was.
    expect(await onDisk(w.repo.main, "BUG-")).toEqual([]);
    expect(w.repo.git(w.repo.main, "status", "--porcelain")).toBe("");
  });

  it("writes a bug under the feature in the folder that has its branch out, uncommitted", async () => {
    await start();
    w.repo.git(w.repo.main, "checkout", "-q", FEATURE_BRANCH);
    const tip = m.tip(FEATURE_BRANCH);
    await expect(file("feature:FEAT-1")).resolves.toEqual({ kind: "card", id: "BUG-1" });
    expect(await onDisk(w.repo.main, "BUG-1")).toEqual(["BUG-1-saves-twice.md"]);
    expect(m.tip(FEATURE_BRANCH)).toBe(tip);
    expect(onBranch(FEATURE_BRANCH, "BUG-")).toEqual([]);
    expect(w.repo.git(w.repo.main, "status", "--porcelain")).toContain("BUG-1-saves-twice.md");
  });
});

describe("an ID already taken where the bug goes (review 2d)", { timeout: 60_000 }, () => {
  it("takes the next ID on a branch committed by plumbing", async () => {
    await start();
    await w.repo.commitOn(FEATURE_BRANCH, (tree) => broken(tree, "BUG-1"), "a file named BUG-1");
    await expect(file("feature:FEAT-1")).resolves.toEqual({ kind: "card", id: "BUG-2" });
    expect(onBranch(FEATURE_BRANCH, "BUG-")).toEqual(["BUG-1-broken.md", "BUG-2-saves-twice.md"]);
  });

  it("takes the next ID in a checked-out folder", async () => {
    await start();
    await broken(w.repo.main, "BUG-1");
    await expect(file("project")).resolves.toEqual({ kind: "card", id: "BUG-2" });
    expect(await onDisk(w.repo.main, "BUG-")).toEqual(["BUG-1-broken.md", "BUG-2-saves-twice.md"]);
  });
});

describe("a branch that moved after the scan (review 1)", { timeout: 60_000 }, () => {
  it("refuses the bug rather than add a second BUG-1 beside one committed meanwhile", async () => {
    const theirs = card("BUG-1", "bug", "FEAT-1", "New", { title: "Theirs" });
    let moved = false;
    await start(async (dir) => {
      const scan = await w.watches.scan(dir);
      // Right after the filing read the branches, someone commits their own BUG-1 to the feature branch.
      if (!moved) {
        moved = true;
        await w.repo.commitOn(FEATURE_BRANCH, (tree) => w.repo.write(tree, theirs), "BUG-1: theirs");
      }
      return scan;
    });
    await expect(file("feature:FEAT-1")).rejects.toThrow(BUG_MESSAGES.moved(FEATURE_BRANCH));
    expect(moved).toBe(true);
    expect(onBranch(FEATURE_BRANCH, "BUG-")).toEqual(["BUG-1-card.md"]);
    expect(show(FEATURE_BRANCH, "BUG-1-card.md").title).toBe("Theirs");
    // Filed again, it reads the branch anew and takes the next ID.
    await expect(file("feature:FEAT-1")).resolves.toEqual({ kind: "card", id: "BUG-2" });
  });
});

describe("a task on a story whose worktree has no copy of its card (review 10)", { timeout: 60_000 }, () => {
  it("is refused as a card edit would be, and writes nothing", async () => {
    await start();
    // STORY-2 is in progress on the feature branch; its worktree, made from main, never had its card.
    const story2 = card("STORY-2", "story", "FEAT-1", "In Progress");
    await w.repo.commitOn(FEATURE_BRANCH, (tree) => w.repo.write(tree, story2), "STORY-2 in progress");
    const tree = w.repo.worktree("featra/story-2-x", "story-2");
    const scan = (await w.watches.scan(w.repo.main))!;
    const owned = scan.resolution.cards.find((c) => c.card.id === "STORY-2")!;
    expect(owned.owner).toMatchObject({ kind: "worktree", branch: "featra/story-2-x" });
    const why = readOnlyReason(owned, true, BASE);
    expect(why).not.toBeNull();
    expect((await bugs.propose(w.repo.main, "STORY-2")).choices.map((c) => c.key)).toContain("task:STORY-2");
    const tip = m.tip(FEATURE_BRANCH);
    await expect(file("task:STORY-2", "STORY-2")).rejects.toThrow(why!);
    expect(await onDisk(tree, "STORY-2")).toEqual([]);
    expect(m.tip(FEATURE_BRANCH)).toBe(tip);
  });
});
