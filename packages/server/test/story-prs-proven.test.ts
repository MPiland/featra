/**
 * STORY-57: a story's criteria proven from the test report CI uploads, read when its PR's checks finish. Real
 * repository, watches, card lane, settings, evidence and proof rules; GitHub (with its runs and artifacts), the remote
 * and the clock are faked.
 */
import { describe, expect, it } from "vitest";
import { evidenceState } from "@featra/work-format";
import { checkRun, junitXml, type FakeRun } from "./fake-gh.ts";
import { MINUTE } from "./manual-clock.ts";
import { prWorld, storyCard } from "./story-prs-world.ts";

const w = prWorld();
const FILE = "packages/app/test/open.test.ts";
const CI = "checksWhere: ci\ntestReportArtifact: test-report-*\n";
/** Three criteria linking tests, and one linking none. */
const ACS = [
  { text: "It opens", done: false, test: `${FILE}::open > opens` },
  { text: "It saves", done: false, test: `${FILE}::open > saves` },
  { text: "It closes", done: false, test: `${FILE}::open > closes` },
  { text: "It looks right", done: false, test: null },
];
type Result = "passed" | "failed" | "skipped";
const report = (opens: Result, saves: Result) =>
  junitXml([
    [FILE, "open > opens", opens],
    [FILE, "open > saves", saves],
  ]);

const head = () => w.repo.git(w.tree, "rev-parse", "HEAD").trim();
const prOf = () => w.prs.prState(w.repo.main, "STORY-1");
const calls = async (kind: string) => (await w.callsOf(kind)).length;

/** Moves the clock and lets the reads it started finish. */
async function after(ms: number) {
  w.clock.advance(ms);
  await w.settle();
  await w.settle();
}

/** The story with ACS goes to review in its worktree, which pushes its branch and opens PR #1 at the branch's tip. */
async function inReview(yaml = CI) {
  await w.start({ yaml });
  await w.repo.write(w.tree, { ...storyCard("In Progress"), acs: ACS });
  w.repo.commit(w.tree, "work");
  await w.settle();
  await w.moveOn("In Review");
  expect((await w.read()).pr).toBe("https://github.com/acme/app/pull/1");
  return head();
}

/** The head's checks, and CI's run of it with the report uploaded per job. */
const ciAt = (sha: string, checks: unknown[], runs: FakeRun[]) =>
  w.gh.change((s) => {
    s.prs[0]!.checksAt = { ...s.prs[0]!.checksAt, [sha]: checks };
    s.runs = [...(s.runs ?? []).filter((r) => r.headSha !== sha), ...runs];
  });
const run = (id: number, sha: string, artifacts: FakeRun["artifacts"], status?: FakeRun["status"]): FakeRun => ({
  id,
  headSha: sha,
  artifacts,
  ...(status ? { status } : {}),
});

describe("the test report setting (AC1)", { timeout: 60_000 }, () => {
  it("is off until the artifact is set: checks finishing read no report, then do once it is set", async () => {
    const a = await inReview("checksWhere: ci\n");
    await ciAt(
      a,
      [checkRun("SUCCESS")],
      [run(11, a, { "test-report-unit": { "junit.xml": report("passed", "passed") } })],
    );
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).verified).toBe(true);
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
    expect(await calls("run list")).toBe(0);
    expect(await calls("run download")).toBe(0);
    await w.settings.set(w.repo.main, { testReportArtifact: "test-report-*" });
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).provenAcs).toEqual([1, 2]);
  });

  it("reads nothing when the project's checks run on this computer", async () => {
    const a = await inReview("checksWhere: local\ntestReportArtifact: test-report-*\n");
    await ciAt(
      a,
      [checkRun("SUCCESS")],
      [run(11, a, { "test-report-unit": { "junit.xml": report("passed", "passed") } })],
    );
    await after(2 * MINUTE);
    expect(await calls("run list")).toBe(0);
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
  });
});

describe("reading the report when checks finish (AC2)", { timeout: 60_000 }, () => {
  it("marks Proven, by system, each criterion whose linked test passed, merging every job's report", async () => {
    const a = await inReview();
    await ciAt(a, [checkRun(null)], [run(11, a, {}, "in_progress")]);
    await after(2 * MINUTE);
    // Checks still running: no report is fetched.
    expect(await calls("run list")).toBe(0);
    await ciAt(
      a,
      [checkRun("SUCCESS")],
      [
        run(11, a, { "test-report-ubuntu": { "junit.xml": report("passed", "skipped") } }),
        run(12, a, { "test-report-windows": { "junit.xml": report("passed", "passed") } }),
      ],
    );
    await after(2 * MINUTE);
    const card = await w.read();
    expect(evidenceState(card).provenAcs).toEqual([1, 2]);
    expect(card.history.filter((e) => e.field === "evidence" && e.to?.startsWith("proven"))).toEqual([
      expect.objectContaining({ to: "proven:1", by: "system" }),
      expect.objectContaining({ to: "proven:2", by: "system" }),
    ]);
  });

  it("reads once per head: later polls fetch nothing, a re-run of the checks is read again", async () => {
    const a = await inReview();
    await ciAt(
      a,
      [checkRun("SUCCESS")],
      [run(11, a, { "test-report-unit": { "junit.xml": report("passed", "failed") } })],
    );
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).provenAcs).toEqual([1]);
    const lists = await calls("run list");
    const downloads = await calls("run download");
    await after(2 * MINUTE);
    await after(2 * MINUTE);
    expect(await calls("run list")).toBe(lists);
    expect(await calls("run download")).toBe(downloads);
    // The failed job is re-run on the same head: checks go back to running, then pass with a new report.
    await ciAt(a, [checkRun(null)], [run(11, a, {}, "in_progress")]);
    await after(2 * MINUTE);
    await ciAt(
      a,
      [checkRun("SUCCESS")],
      [run(11, a, { "test-report-unit": { "junit.xml": report("passed", "passed") } })],
    );
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).provenAcs).toEqual([1, 2]);
  });

  it("reads no report for a head that isn't the story branch's tip", async () => {
    const a = await inReview();
    // A commit lands in the worktree and isn't pushed yet: the PR's head is behind the branch.
    w.repo.commit(w.tree, "B");
    await ciAt(
      a,
      [checkRun("SUCCESS")],
      [run(11, a, { "test-report-unit": { "junit.xml": report("passed", "passed") } })],
    );
    await after(2 * MINUTE);
    expect(await calls("run list")).toBe(0);
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
  });

  it("tries again at the next poll when the download fails", async () => {
    const a = await inReview();
    await w.gh.change((s) => {
      s.downloadFails = "HTTP 502: Bad Gateway";
    });
    await ciAt(
      a,
      [checkRun("SUCCESS")],
      [run(11, a, { "test-report-unit": { "junit.xml": report("passed", "passed") } })],
    );
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
    await w.gh.change((s) => {
      delete s.downloadFails;
    });
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).provenAcs).toEqual([1, 2]);
  });
});

describe("criteria the report didn't prove (AC3)", { timeout: 60_000 }, () => {
  it("stay unproven, and the card says which failed, which are missing, and why", async () => {
    const a = await inReview();
    await ciAt(
      a,
      [checkRun("FAILURE")],
      [run(11, a, { "test-report-unit": { "junit.xml": report("passed", "failed") } })],
    );
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).provenAcs).toEqual([1]);
    expect(prOf()?.report).toEqual({
      failedAcs: [2],
      missingAcs: [3],
      reasons: ['AC 2: "open saves" failed.', 'AC 3: No test named "open closes" ran.'],
      note: null,
    });
  });

  it("says so when CI uploaded no report for the head, leaving every linked criterion missing", async () => {
    const a = await inReview();
    await ciAt(a, [checkRun("SUCCESS")], [run(11, a, { "playwright-traces": { "trace.zip": "zip" } })]);
    await after(2 * MINUTE);
    expect(prOf()?.report).toMatchObject({ failedAcs: [], missingAcs: [1, 2, 3] });
    expect(prOf()?.report?.note).toMatch(/no test report/i);
  });

  it("takes Proven away when the test fails or is missing on a new head, with the reason", async () => {
    const a = await inReview();
    await ciAt(
      a,
      [checkRun("SUCCESS")],
      [run(11, a, { "test-report-unit": { "junit.xml": report("passed", "passed") } })],
    );
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).provenAcs).toEqual([1, 2]);
    // Back to work: commit B is pushed when the story returns to review.
    await w.moveOn("In Progress");
    w.repo.commit(w.tree, "B");
    const b = head();
    await w.moveOn("In Review");
    expect(w.repo.git(w.remote, "rev-parse", "featra/story-1-pr").trim()).toBe(b);
    // Proven for A goes as soon as the head moves, before B's report is read.
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
    expect(await calls("run download")).toBe(1);
    const onlyOpens = junitXml([[FILE, "open > opens", "failed"]]);
    await ciAt(b, [checkRun("FAILURE")], [run(21, b, { "test-report-unit": { "junit.xml": onlyOpens } })]);
    await after(2 * MINUTE);
    const card = await w.read();
    expect(evidenceState(card).provenAcs).toEqual([]);
    expect(card.history.filter((e) => e.field === "evidence").map((e) => e.to)).toEqual(
      expect.arrayContaining(["unproven:1", "unproven:2"]),
    );
    expect(prOf()?.report).toEqual({
      failedAcs: [1],
      missingAcs: [2, 3],
      reasons: [
        'AC 1: "open opens" failed.',
        'AC 2: No test named "open saves" ran.',
        'AC 3: No test named "open closes" ran.',
      ],
      note: null,
    });
  });

  it("takes Proven away once the story's branch is past the PR's head, and the new head's report proves again", async () => {
    const a = await inReview();
    const passed = { "test-report-unit": { "junit.xml": report("passed", "passed") } };
    await ciAt(a, [checkRun("SUCCESS")], [run(11, a, passed)]);
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).provenAcs).toEqual([1, 2]);
    // A commit lands in the worktree and isn't pushed yet: A's report no longer proves the branch.
    w.repo.commit(w.tree, "B");
    const b = head();
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).provenAcs).toEqual([]);
    expect(prOf()?.report).toBeUndefined();
    // B is pushed and its checks pass with a report.
    w.repo.git(w.tree, "push", "origin", `HEAD:featra/story-1-pr`);
    await ciAt(b, [checkRun("SUCCESS")], [run(21, b, passed)]);
    await after(2 * MINUTE);
    expect(evidenceState(await w.read()).provenAcs).toEqual([1, 2]);
  });
});
