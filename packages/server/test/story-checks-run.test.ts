/**
 * STORY-56 AC3 and AC4: when the check command runs, what it writes to the card, and when nothing runs (including a
 * command that the project's config changed and the user has not confirmed). See story-checks-world.ts.
 */
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { CHECKS_COPY, evidenceState, recordAcceptance, type CardChecks } from "@featra/work-format";
import { ApiError } from "../src/api-error.ts";
import { cardViewIn } from "../src/card-actions.ts";
import { storyCard, checksWorld } from "./story-checks-world.ts";
import { GIT_ASKED_MS, until } from "./until.ts";

const configWith = (command: string) => `version: 1\nchecksWhere: local\ncheckCommand: ${command}\n`;

const w = checksWorld();

describe("a story reaching review (AC3, AC4)", () => {
  it("runs the check command in its worktree and marks it Verified by system", async () => {
    await w.start();
    await w.toReview();
    expect(await w.lines("runs.log")).toHaveLength(1);
    const after = await w.read();
    expect(evidenceState(after).verified).toBe(true);
    expect(after.history.at(-1)).toMatchObject({ field: "evidence", to: "verified", by: "system" });
    expect(w.state()).toMatchObject({ running: false, last: { passed: true, command: "node check.cjs" } });
  });

  it("does not run while the story is still being built", async () => {
    await w.start();
    await w.repo.write(w.tree, storyCard("In Progress", { title: "Renamed" }));
    await w.watches.scan(w.repo.main);
    await w.checks.idle();
    expect(await w.lines("runs.log")).toEqual([]);
  });

  it("writes to the owner copy only, leaving main's copy alone", async () => {
    await w.start();
    const main = await w.repo.read(w.repo.main, "STORY-1");
    await w.toReview();
    expect(await w.repo.read(w.repo.main, "STORY-1")).toBe(main);
  });

  it("removes Verified when the run fails, and the card shows the failing output", async () => {
    await w.start();
    await w.toReview();
    await writeFile(w.inTree("verdict.txt"), "broken\n");
    await w.checks.rerun(w.repo.main, "STORY-1");
    const after = await w.read();
    expect(evidenceState(after).verified).toBe(false);
    expect(after.history.at(-1)).toMatchObject({ field: "evidence", to: "unverified", by: "system" });
    const view = cardViewIn(await w.watches.scan(w.repo.main), "STORY-1", w.state());
    expect(view?.checks?.last).toMatchObject({ passed: false });
    expect(view?.checks?.last?.output).toContain("boom: broken");
  });

  it("keeps Verified and adds no history when a re-run changes nothing", async () => {
    await w.start();
    await w.toReview();
    const before = (await w.read()).history.length;
    await w.checks.rerun(w.repo.main, "STORY-1");
    expect((await w.read()).history).toHaveLength(before);
    expect(await w.lines("runs.log")).toHaveLength(2);
  });

  it("runs again when a commit lands in the worktree", async () => {
    await w.start();
    await w.toReview();
    await writeFile(w.inTree("verdict.txt"), "committed\n");
    w.repo.commit(w.tree, "break it");
    await until(() => w.state()?.last?.passed === false, GIT_ASKED_MS);
    await w.checks.idle();
    expect(evidenceState(await w.read()).verified).toBe(false);
  });

  it("moves a story the user already accepted to Done when it becomes Verified", async () => {
    await w.start();
    await w.repo.write(w.tree, recordAcceptance(storyCard("Acceptance"), true, "user", "2026-11-12T09:00:00Z"));
    await w.watches.scan(w.repo.main);
    await w.checks.idle();
    const done = await w.read();
    expect(done.status).toBe("Done");
    expect(done.history.at(-1)).toMatchObject({ field: "status", to: "Done", by: "system" });
  });

  it("keeps the last 20,000 characters of output", async () => {
    await w.start();
    await w.toReview();
    await writeFile(w.inTree("verdict.txt"), "broken\n");
    await writeFile(w.inTree("flood.txt"), "1");
    await w.checks.rerun(w.repo.main, "STORY-1");
    const output = w.state()?.last?.output ?? "";
    expect(output.length).toBeLessThanOrEqual(20_003);
    expect(output).toContain("boom: broken");
  });
});

describe("one run per worktree at a time", () => {
  it("runs a burst of requests twice: the one running, then one more", async () => {
    await w.start();
    await w.toReview();
    await writeFile(w.inTree("delay.txt"), "300");
    const before = (await w.lines("runs.log")).length;
    await Promise.all([1, 2, 3, 4].map(() => w.checks.rerun(w.repo.main, "STORY-1")));
    expect((await w.lines("runs.log")).length - before).toBe(2);
  });
});

describe("what is shown when nothing runs (AC1, AC3)", () => {
  it("says so when there is no check command", async () => {
    await w.start();
    await writeFile(`${w.repo.main}/.featra/config.yaml`, "version: 1\nchecksWhere: local\n");
    await w.toReview();
    expect(w.state()).toMatchObject<Partial<CardChecks>>({ idle: CHECKS_COPY.noCommand, running: false });
    expect(await w.lines("runs.log")).toEqual([]);
  });

  it("refuses a re-run when the project's checks run in CI", async () => {
    await w.start({ yaml: "" });
    const config = await readFile(`${w.repo.main}/.featra/config.yaml`, "utf8");
    await writeFile(`${w.repo.main}/.featra/config.yaml`, config.replace("checksWhere: local", "checksWhere: ci"));
    await w.toReview();
    await expect(w.checks.rerun(w.repo.main, "STORY-1")).rejects.toBeInstanceOf(ApiError);
    expect(await w.lines("runs.log")).toEqual([]);
    expect(w.state()).toBeUndefined();
  });

  it("refuses a re-run of a story that is not in review", async () => {
    await w.start();
    await expect(w.checks.rerun(w.repo.main, "STORY-1")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("a command the project's config changed, which git can do (AC3)", () => {
  it("does not run a check command nobody has confirmed, and says it was changed", async () => {
    await w.start({ confirm: false });
    await w.toReview();
    expect(await w.lines("runs.log")).toEqual([]);
    expect(w.state()).toMatchObject({ running: false, last: null });
    expect(w.state()?.idle).toMatch(/changed in the project's config/i);
  });

  it("runs it once the user confirms it", async () => {
    await w.start({ confirm: false });
    await w.toReview();
    await w.settings.set(w.repo.main, { confirm: ["command"] });
    await w.checks.rerun(w.repo.main, "STORY-1");
    expect(await w.lines("runs.log")).toHaveLength(1);
    expect(w.state()?.last).toMatchObject({ passed: true });
  });

  it("does not run a different command that a git change put in the config, until it is confirmed", async () => {
    await w.start();
    await w.toReview();
    expect(await w.lines("runs.log")).toHaveLength(1);
    await writeFile(`${w.repo.main}/.featra/config.yaml`, configWith("node check.cjs --changed"));
    await w.checks.rerun(w.repo.main, "STORY-1");
    expect(await w.lines("runs.log")).toHaveLength(1);
    expect(w.state()?.idle).toMatch(/changed in the project's config/i);
    await w.settings.set(w.repo.main, { confirm: ["command"] });
    await w.checks.rerun(w.repo.main, "STORY-1");
    expect(await w.lines("runs.log")).toHaveLength(2);
    expect(w.state()?.last?.command).toBe("node check.cjs --changed");
  });
});

describe("what a failing run leaves behind", () => {
  it("never leaves the card saying it is still running when the run itself broke", async () => {
    let calls = 0;
    await w.start({
      scan: (scan) => async (dir) => {
        if (w.checks.checksFor(w.repo.main, "STORY-1")?.running && calls++ === 0) throw new Error("scan broke");
        return scan(dir);
      },
    });
    await w.toReview();
    expect(w.state()).toMatchObject({ running: false });
    expect(w.state()?.note).toContain("scan broke");
  });

  it("drops a story's checks when it leaves review", async () => {
    await w.start();
    await w.toReview();
    expect(w.state()).toBeDefined();
    await w.repo.write(w.tree, storyCard("In Progress"));
    await w.watches.scan(w.repo.main);
    await until(() => w.state() === undefined, GIT_ASKED_MS);
  });
});
