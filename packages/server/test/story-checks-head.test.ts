/**
 * STORY-12: Verified must be for the story branch's current head. The local checks say which commit they last settled
 * on (`settledHead`), and record it on the card with the verdict (`checked:<commit>`), which a local merge compares with
 * the branch's tip, after a restart too. See story-checks-world.ts.
 */
import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { evidenceState } from "@featra/work-format";
import { checksWorld } from "./story-checks-world.ts";
import { GIT_ASKED_MS, until } from "./until.ts";

const w = checksWorld();
const head = () => w.repo.git(w.tree, "rev-parse", "HEAD").trim();
const stored = async () => evidenceState(await w.read()).checkedHead;
const settled = async () => w.checks.settledHead(w.repo.main, "STORY-1", await stored());

describe("the commit the checks settled on", () => {
  it("is the worktree's head the passing run checked, and the card records it by system", async () => {
    await w.start();
    await w.toReview();
    expect(await settled()).toBe(head());
    expect(await stored()).toBe(head());
    expect((await w.read()).history.slice(-2)).toMatchObject([
      { field: "evidence", to: `checked:${head()}`, by: "system" },
      { field: "evidence", to: "verified", by: "system" },
    ]);
  });

  it("follows a commit that lands, once its run has finished", async () => {
    await w.start();
    await w.toReview();
    const before = head();
    await writeFile(w.inTree("more.txt"), "more\n");
    w.repo.commit(w.tree, "more");
    expect(head()).not.toBe(before);
    await until(() => w.checks.settledHead(w.repo.main, "STORY-1", null) === head(), GIT_ASKED_MS);
    await w.checks.idle();
    expect(await settled()).toBe(head());
    expect(await stored()).toBe(head());
  });

  it("is unknown for a story the checks haven't seen", async () => {
    await w.start();
    expect(w.checks.settledHead(w.repo.main, "STORY-9", null)).toBeNull();
  });
});

describe("after a restart (review fix)", () => {
  it("is the commit the card recorded, not one Featra only saw on start: a commit made while closed isn't checked", async () => {
    await w.start();
    await w.toReview();
    const checked = head();
    w.checks.close();
    await writeFile(w.inTree("closed.txt"), "made while Featra was closed\n");
    w.repo.commit(w.tree, "while closed");
    await w.restart();
    expect(head()).not.toBe(checked);
    expect(await settled()).toBe(checked);
    expect(w.checks.settledHead(w.repo.main, "STORY-1", null)).toBeNull();
  });

  it("is the commit the card recorded when nothing changed", async () => {
    await w.start();
    await w.toReview();
    await w.restart();
    expect(await settled()).toBe(head());
  });
});
