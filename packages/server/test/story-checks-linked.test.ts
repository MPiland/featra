/**
 * STORY-56 AC5: each criterion's linked test. A criterion is Proven only when the JUnit report a run writes has the
 * linked test, by its full name, passed (ADR 0004); an exit code proves nothing. See story-checks-world.ts.
 */
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { evidenceState } from "@featra/work-format";
import { cardViewIn } from "../src/card-actions.ts";
import { LINKED_NOTES } from "../src/linked-tests.ts";
import { linked, checksWorld } from "./story-checks-world.ts";

const w = checksWorld();
const A = "test/a.test.ts";
const B = "test/b.test.ts";

describe("each criterion's linked test (AC5)", () => {
  it("marks a criterion Proven when its test passes and shows one that fails", async () => {
    await w.start();
    await w.toReview("In Review", linked(`${A}::group > works`, `${B}::breaks`, null));
    expect(evidenceState(await w.read()).provenAcs).toEqual([1]);
    expect(w.state()?.failedAcs).toEqual([2]);
    const view = cardViewIn(await w.watches.scan(w.repo.main), "STORY-1", w.state());
    expect(view?.acs.map((a) => a.proof)).toEqual(["passed", "failed", "none"]);
    expect(w.state()?.last?.output).toContain("test failed: breaks");
  });

  it("runs each test file once, with its linked names as one pattern and a report path", async () => {
    await w.start();
    await w.toReview("In Review", linked(`${A}::one`, `${A}::three`, `${B}::two`));
    expect(await w.lines("args.log")).toEqual([`${A}|one|three`, `${B}|two`]);
    expect(evidenceState(await w.read()).provenAcs).toEqual([1, 2, 3]);
  });

  it("never lets card text reach the shell", async () => {
    await w.start();
    const name = "ok $HOME `node pwn.cjs` & node pwn.cjs && node pwn.cjs | node pwn.cjs";
    await w.toReview("In Review", linked(`${A}::${name}`));
    const [ran] = await w.lines("args.log");
    expect(ran).toMatch(/^test\/a\.test\.ts\|ok /);
    await expect(readFile(w.inTree("pwned.txt"), "utf8")).rejects.toThrow(/ENOENT/);
  });

  it("runs linked tests even when the check command fails, and an AC with two tests needs both", async () => {
    await w.start();
    await writeFile(w.inTree("verdict.txt"), "broken\n");
    await w.toReview("In Review", linked(`${A}::one; ${B}::breaks`, `${A}::three`));
    const after = await w.read();
    expect(evidenceState(after).verified).toBe(false);
    expect(evidenceState(after).provenAcs).toEqual([2]);
    expect(w.state()?.failedAcs).toEqual([1]);
  });

  it("removes Proven when the test starts failing", async () => {
    await w.start();
    await w.toReview("In Review", linked(`${A}::works`));
    expect(evidenceState(await w.read()).provenAcs).toEqual([1]);
    await writeFile(w.inTree(A), "fail works\n");
    await w.checks.rerun(w.repo.main, "STORY-1");
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
  });

  it("counts a missing test file as a failure", async () => {
    await w.start();
    await w.toReview("In Review", linked("test/missing.test.ts::nope"));
    expect(w.state()?.failedAcs).toEqual([1]);
    expect(w.state()?.last?.output).toContain("test/missing.test.ts is not in this worktree");
  });

  it("leaves a test the card names only in prose alone", async () => {
    await w.start();
    await w.toReview("In Review", linked("see the e2e journey"));
    expect(await w.lines("args.log")).toEqual([]);
    expect(w.state()?.failedAcs).toEqual([]);
  });
});

describe("a report is the only proof (AC5, ADR 0004)", () => {
  it("does not prove a test whose name matches nothing, though the runner exits 0", async () => {
    await w.start();
    await w.toReview("In Review", linked(`${A}::a test nobody wrote`));
    expect(await w.lines("args.log")).toEqual([`${A}|a test nobody wrote`]);
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
    expect(w.state()?.failedAcs).toEqual([1]);
  });

  it("does not prove a name that is only part of another test's name", async () => {
    await w.start();
    await w.toReview("In Review", linked(`${A}::group`, `${A}::group works fast`));
    expect(evidenceState(await w.read()).provenAcs).toEqual([2]);
    expect(w.state()?.failedAcs).toEqual([1]);
  });

  it("does not prove a skipped test", async () => {
    await w.start();
    await w.toReview("In Review", linked(`${A}::later`));
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
    expect(w.state()?.failedAcs).toEqual([1]);
  });

  it("does not prove anything when the runner exits 0 and writes no report", async () => {
    await w.start({ template: "node no-report.cjs {file} {namePattern} {report}" });
    await w.toReview("In Review", linked(`${A}::works`));
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
    expect(w.state()?.failedAcs).toEqual([1]);
  });

  it("says it can't prove tests without a report when the command has no {report}, and runs nothing", async () => {
    await w.start({ template: "node run-test.cjs {file} {namePattern}" });
    await w.toReview("In Review", linked(`${A}::works`));
    expect(await w.lines("args.log")).toEqual([]);
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
    expect(w.state()?.note).toBe(LINKED_NOTES.noReport);
    expect(w.state()?.note).toMatch(/^Can't prove linked tests without a report/);
  });

  it("leaves criteria unchanged and says why when no linked test command is set", async () => {
    await w.start({ template: null });
    await w.toReview("In Review", linked(`${A}::works`));
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
    expect(w.state()?.note).toMatch(/linked test command/i);
  });
});

describe("a test that no command runs (AC5)", () => {
  const E2E = "apps/desktop/e2e/journey.spec.ts";

  it("says no command runs it, and leaves the criterion as it was, never failed", async () => {
    await w.start();
    await w.toReview("In Review", linked(`${E2E}::the journey`));
    expect(await w.lines("args.log")).toEqual([]);
    expect(w.state()?.note).toContain(LINKED_NOTES.noRunner);
    expect(w.state()?.failedAcs).toEqual([]);
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
  });

  it("keeps a criterion that was Proven when its link then names such a test too", async () => {
    await w.start();
    await w.toReview("In Review", linked(`${A}::works`));
    expect(evidenceState(await w.read()).provenAcs).toEqual([1]);
    const now = await w.read();
    const acs = now.acs.map((ac) => ({ ...ac, test: `${ac.test}; ${E2E}::the journey` }));
    await w.repo.write(w.tree, { ...now, acs });
    await w.checks.rerun(w.repo.main, "STORY-1");
    expect(evidenceState(await w.read()).provenAcs).toEqual([1]);
    expect(w.state()?.failedAcs).toEqual([]);
    expect(w.state()?.note).toContain(LINKED_NOTES.noRunner);
  });
});

describe("a linked test command the project's config changed (AC5)", () => {
  it("does not run it until the user confirms it", async () => {
    await w.start();
    const config = await readFile(`${w.repo.main}/.featra/config.yaml`, "utf8");
    await writeFile(`${w.repo.main}/.featra/config.yaml`, config.replace("{report}", "{report} --changed"));
    await w.toReview("In Review", linked(`${A}::works`));
    expect(await w.lines("args.log")).toEqual([]);
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
    expect(w.state()?.note).toMatch(/linked test command was changed/i);
    await w.settings.set(w.repo.main, { confirm: ["testCommand"] });
    await w.checks.rerun(w.repo.main, "STORY-1");
    expect(await w.lines("args.log")).toHaveLength(1);
    expect(evidenceState(await w.read()).provenAcs).toEqual([1]);
  });
});
