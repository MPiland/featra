/**
 * STORY-12: Verified must be for the story branch's current head. The local checks say which commit they last settled
 * on (`settledHead`), which a local merge compares with the branch's tip. See story-checks-world.ts.
 */
import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { checksWorld } from "./story-checks-world.ts";
import { GIT_ASKED_MS, until } from "./until.ts";

const w = checksWorld();
const head = () => w.repo.git(w.tree, "rev-parse", "HEAD").trim();
const settled = () => w.checks.settledHead(w.repo.main, "STORY-1");

describe("the commit the checks settled on", () => {
  it("is the worktree's head the passing run checked", async () => {
    await w.start();
    await w.toReview();
    expect(settled()).toBe(head());
  });

  it("follows a commit that lands, once its run has finished", async () => {
    await w.start();
    await w.toReview();
    const before = head();
    await writeFile(w.inTree("more.txt"), "more\n");
    w.repo.commit(w.tree, "more");
    expect(head()).not.toBe(before);
    await until(() => settled() === head(), GIT_ASKED_MS);
    await w.checks.idle();
    expect(settled()).toBe(head());
  });

  it("is unknown for a story the checks haven't seen", async () => {
    await w.start();
    expect(w.checks.settledHead(w.repo.main, "STORY-9")).toBeNull();
  });
});
