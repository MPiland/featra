/**
 * STORY-56: local checks. A real repository with a story's worktree, the real scanner, watches, card lane and
 * work-format rules. Only the platform is a stand-in: the check command and the linked-test command are small Node
 * scripts of the project (`check.cjs`, `run-test.cjs`) that read their verdict from a file in the worktree.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CHECKS_COPY,
  evidenceState,
  parseCard,
  recordAcceptance,
  type Card,
  type CardChecks,
} from "@featra/work-format";
import { createAllowedProjects, type AllowedProjects } from "../src/allowed-projects.ts";
import { ApiError } from "../src/api-error.ts";
import { cardViewIn } from "../src/card-actions.ts";
import { createCheckSettings } from "../src/check-settings.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createStoryChecks, type StoryChecks } from "../src/story-checks.ts";
import { createScanner } from "../src/work-scan.ts";
import { createWorkWatches, type WorkWatches } from "../src/work-watch.ts";
import { card, cardRepo, moved, type CardRepo } from "./card-repo.ts";
import { GIT_ASKED_MS, until } from "./until.ts";

const CHECK = `const fs = require("fs");
fs.appendFileSync("runs.log", "x\\n");
const wait = fs.existsSync("delay.txt") ? Number(fs.readFileSync("delay.txt", "utf8")) : 0;
if (wait) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
if (fs.existsSync("flood.txt")) process.stdout.write("z".repeat(100000));
const verdict = fs.readFileSync("verdict.txt", "utf8").trim();
if (verdict !== "pass") { console.log("boom: " + verdict); process.exit(1); }
`;

const RUN_TEST = `const fs = require("fs");
const [file, name] = process.argv.slice(2);
fs.appendFileSync("args.log", [file, name].join("|") + "\\n");
if (!fs.readFileSync(file, "utf8").includes("pass")) { console.log("test failed: " + name); process.exit(1); }
`;

const config = (extra: string) =>
  `version: 1\nchecksWhere: local\ncheckCommand: node check.cjs\nlinkedTestCommand: node run-test.cjs {file} {name}\n${extra}`;

let repo: CardRepo;
let tree: string;
let allowed: AllowedProjects;
let watches: WorkWatches;
let checks: StoryChecks;
let scanner: ReturnType<typeof createScanner>;
const clock = new Date("2026-11-12T10:00:00Z");

const storyCard = (status: string, extra: Partial<Card> = {}): Card => ({
  ...moved(card("STORY-1", "story", "FEAT-1", "In Progress"), status),
  ...extra,
});
const read = async (dir = tree): Promise<Card> => parseCard(await repo.read(dir, "STORY-1"));
const inTree = (name: string) => join(tree, name);
const lines = async (name: string) =>
  (await readFile(inTree(name), "utf8").catch(() => "")).split("\n").filter(Boolean);

/** The story reaches review in its worktree, as a session's report would write it; the scan then tells the watchers. */
async function toReview(status = "In Review", extra: Partial<Card> = {}) {
  await repo.write(tree, storyCard(status, extra));
  await watches.scan(repo.main);
  await checks.idle();
}

const stateOf = () => checks.checksFor(repo.main, "STORY-1");

async function start(yaml = "") {
  await writeFile(join(repo.main, ".featra", "config.yaml"), config(yaml));
  await writeFile(join(repo.main, "check.cjs"), CHECK);
  await writeFile(join(repo.main, "run-test.cjs"), RUN_TEST);
  await writeFile(join(repo.main, "pwn.cjs"), 'require("fs").writeFileSync("pwned.txt", "x");');
  await writeFile(join(repo.main, "verdict.txt"), "pass\n");
  await mkdir(join(repo.main, "test"), { recursive: true });
  await writeFile(join(repo.main, "test", "a.test.ts"), "pass\n");
  await writeFile(join(repo.main, "test", "b.test.ts"), "fail\n");
  await writeFile(join(repo.main, ".gitignore"), "runs.log\nargs.log\ndelay.txt\nflood.txt\n");
  repo.commit(repo.main, "project");
  repo.git(repo.main, "branch", "feature/1");
  tree = repo.worktree("story-1", "story-1", "feature/1");
  allowed.set([repo.main]);
  checks = createStoryChecks({
    scan: watches.scan,
    observe: watches.observe,
    allowed,
    settings: createCheckSettings({ scan: watches.scan, now: () => clock }),
    now: () => clock,
    log: () => {},
    timeoutMs: 30_000,
  });
  // The watch starts, so what is in review now is the baseline and only a change runs.
  await watches.watch(repo.main, () => {});
  await until(() => true);
}

beforeEach(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "active"));
  await repo.write(repo.main, storyCard("In Progress"));
  repo.commit(repo.main, "plan");
  allowed = createAllowedProjects();
  scanner = createScanner(createRepoGit());
  watches = createWorkWatches(scanner, () => {});
});

afterEach(async () => {
  checks?.close();
  watches.close();
  await scanner.close();
  await repo.dispose();
});

describe("a story reaching review (AC3, AC4)", () => {
  it("runs the check command in its worktree and marks it Verified by system", async () => {
    await start();
    await toReview();
    expect(await lines("runs.log")).toHaveLength(1);
    const after = await read();
    expect(evidenceState(after).verified).toBe(true);
    expect(after.history.at(-1)).toMatchObject({ field: "evidence", to: "verified", by: "system" });
    expect(stateOf()).toMatchObject({ running: false, last: { passed: true, command: "node check.cjs" } });
  });

  it("does not run while the story is still being built", async () => {
    await start();
    await repo.write(tree, storyCard("In Progress", { title: "Renamed" }));
    await watches.scan(repo.main);
    await checks.idle();
    expect(await lines("runs.log")).toEqual([]);
  });

  it("writes to the owner copy only, leaving main's copy alone", async () => {
    await start();
    const main = await repo.read(repo.main, "STORY-1");
    await toReview();
    expect(await repo.read(repo.main, "STORY-1")).toBe(main);
  });

  it("removes Verified when the run fails, and the card shows the failing output", async () => {
    await start();
    await toReview();
    await writeFile(inTree("verdict.txt"), "broken\n");
    await checks.rerun(repo.main, "STORY-1");
    const after = await read();
    expect(evidenceState(after).verified).toBe(false);
    expect(after.history.at(-1)).toMatchObject({ field: "evidence", to: "unverified", by: "system" });
    const view = cardViewIn(await watches.scan(repo.main), "STORY-1", stateOf());
    expect(view?.checks?.last).toMatchObject({ passed: false });
    expect(view?.checks?.last?.output).toContain("boom: broken");
  });

  it("keeps Verified and adds no history when a re-run changes nothing", async () => {
    await start();
    await toReview();
    const before = (await read()).history.length;
    await checks.rerun(repo.main, "STORY-1");
    expect((await read()).history).toHaveLength(before);
    expect(await lines("runs.log")).toHaveLength(2);
  });

  it("runs again when a commit lands in the worktree", async () => {
    await start();
    await toReview();
    await writeFile(inTree("verdict.txt"), "committed\n");
    repo.commit(tree, "break it");
    await until(() => stateOf()?.last?.passed === false, GIT_ASKED_MS);
    await checks.idle();
    expect(evidenceState(await read()).verified).toBe(false);
  });

  it("moves a story the user already accepted to Done when it becomes Verified", async () => {
    await start();
    const waiting = recordAcceptance(storyCard("Acceptance"), true, "user", "2026-11-12T09:00:00Z");
    await repo.write(tree, waiting);
    await watches.scan(repo.main);
    await checks.idle();
    const done = await read();
    expect(done.status).toBe("Done");
    expect(done.history.at(-1)).toMatchObject({ field: "status", to: "Done", by: "system" });
  });

  it("keeps the last 20,000 characters of output", async () => {
    await start();
    await toReview();
    await writeFile(inTree("verdict.txt"), "broken\n");
    await writeFile(inTree("flood.txt"), "1");
    await checks.rerun(repo.main, "STORY-1");
    const output = stateOf()?.last?.output ?? "";
    expect(output.length).toBeLessThanOrEqual(20_003);
    expect(output).toContain("boom: broken");
  });
});

describe("one run per worktree at a time", () => {
  it("runs a burst of requests twice: the one running, then one more", async () => {
    await start();
    await toReview();
    await writeFile(inTree("delay.txt"), "300");
    const before = (await lines("runs.log")).length;
    await Promise.all([1, 2, 3, 4].map(() => checks.rerun(repo.main, "STORY-1")));
    expect((await lines("runs.log")).length - before).toBe(2);
  });
});

describe("what is shown when nothing runs (AC1, AC3)", () => {
  it("says so when there is no check command", async () => {
    await start();
    await writeFile(join(repo.main, ".featra", "config.yaml"), "version: 1\nchecksWhere: local\n");
    await toReview();
    expect(stateOf()).toMatchObject<Partial<CardChecks>>({ idle: CHECKS_COPY.noCommand, running: false });
    expect(await lines("runs.log")).toEqual([]);
  });

  it("refuses a re-run when the project's checks run in CI", async () => {
    await start();
    await writeFile(
      join(repo.main, ".featra", "config.yaml"),
      config("").replace("checksWhere: local", "checksWhere: ci"),
    );
    await toReview();
    await expect(checks.rerun(repo.main, "STORY-1")).rejects.toBeInstanceOf(ApiError);
    expect(await lines("runs.log")).toEqual([]);
    expect(stateOf()).toBeUndefined();
  });

  it("refuses a re-run of a story that is not in review", async () => {
    await start();
    await expect(checks.rerun(repo.main, "STORY-1")).rejects.toBeInstanceOf(ApiError);
  });
});

/** A story's criteria, each with the test link given (or none). */
const linked = (...tests: (string | null)[]): Partial<Card> => ({
  acs: tests.map((test, i) => ({ text: `AC ${i + 1}`, done: false, test })),
});

describe("each criterion's linked test (AC5)", () => {
  it("marks a criterion Proven when its test passes and shows one that fails", async () => {
    await start();
    await toReview("In Review", linked("test/a.test.ts::group > works", "test/b.test.ts::breaks", null));
    const after = await read();
    expect(evidenceState(after).provenAcs).toEqual([1]);
    expect(stateOf()?.failedAcs).toEqual([2]);
    const view = cardViewIn(await watches.scan(repo.main), "STORY-1", stateOf());
    expect(view?.acs.map((a) => a.proof)).toEqual(["passed", "failed", "none"]);
    expect(stateOf()?.last?.output).toContain("test failed: breaks");
  });

  it("passes the file and the test's name as arguments, joined as a runner prints them", async () => {
    await start();
    await toReview("In Review", linked("test/a.test.ts::group > works"));
    expect(await lines("args.log")).toEqual(["test/a.test.ts|group works"]);
  });

  it("never lets card text reach the shell", async () => {
    await start();
    const name = "ok $HOME `node pwn.cjs` & node pwn.cjs && node pwn.cjs | node pwn.cjs";
    await toReview("In Review", linked(`test/a.test.ts::${name}`));
    expect(await lines("args.log")).toEqual([`test/a.test.ts|${name}`]);
    await expect(readFile(inTree("pwned.txt"), "utf8")).rejects.toThrow(/ENOENT/);
  });

  it("runs linked tests even when the check command fails, and an AC with two tests needs both", async () => {
    await start();
    await writeFile(inTree("verdict.txt"), "broken\n");
    await toReview("In Review", linked("test/a.test.ts::one; test/b.test.ts::two", "test/a.test.ts::three"));
    const after = await read();
    expect(evidenceState(after).verified).toBe(false);
    expect(evidenceState(after).provenAcs).toEqual([2]);
    expect(stateOf()?.failedAcs).toEqual([1]);
  });

  it("removes Proven when the test starts failing", async () => {
    await start();
    await toReview("In Review", linked("test/a.test.ts::works"));
    expect(evidenceState(await read()).provenAcs).toEqual([1]);
    await writeFile(inTree("test/a.test.ts"), "broken\n");
    await checks.rerun(repo.main, "STORY-1");
    expect(evidenceState(await read()).provenAcs).toEqual([]);
  });

  it("counts a missing test file as a failure", async () => {
    await start();
    await toReview("In Review", linked("test/missing.test.ts::nope"));
    expect(stateOf()?.failedAcs).toEqual([1]);
    expect(stateOf()?.last?.output).toContain("test/missing.test.ts is not in this worktree");
  });

  it("leaves criteria unchanged and says why when no linked test command is set", async () => {
    await start();
    await writeFile(
      join(repo.main, ".featra", "config.yaml"),
      "version: 1\nchecksWhere: local\ncheckCommand: node check.cjs\n",
    );
    await toReview("In Review", linked("test/a.test.ts::works"));
    expect(evidenceState(await read()).provenAcs).toEqual([]);
    expect(stateOf()?.note).toMatch(/linked test command/i);
  });

  it("leaves a test the card names only in prose alone", async () => {
    await start();
    await toReview("In Review", linked("see the e2e journey"));
    expect(await lines("args.log")).toEqual([]);
    expect(stateOf()?.failedAcs).toEqual([]);
  });
});
