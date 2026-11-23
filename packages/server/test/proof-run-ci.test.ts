/**
 * STORY-69 AC3/AC4: a criterion proven by CI's test report keeps the link to the workflow run that proved it, in the
 * card on disk. Real repository, watches, card lane, settings, evidence and proof rules; GitHub (with its runs and
 * artifacts), the remote and the clock are faked. See story-prs-world.ts.
 */
import { describe, expect, it } from "vitest";
import { provenRuns } from "@featra/work-format";
import { checkRun, junitXml, type FakeRun } from "./fake-gh.ts";
import { MINUTE } from "./manual-clock.ts";
import { prWorld, storyCard } from "./story-prs-world.ts";

const w = prWorld();
const FILE = "packages/app/test/open.test.ts";
const CI = "checksWhere: ci\ntestReportArtifact: test-report-*\n";
const ACS = [
  { text: "It opens", done: false, test: `${FILE}::open > opens` },
  { text: "It saves", done: false, test: `${FILE}::open > saves` },
  { text: "It closes", done: false, test: `${FILE}::open > closes` },
];
type Result = "passed" | "failed" | "skipped";
const report = (opens: Result, saves: Result) =>
  junitXml([
    [FILE, "open > opens", opens],
    [FILE, "open > saves", saves],
  ]);
const RUNS = "https://github.com/acme/app/actions/runs";

async function after(ms: number) {
  w.clock.advance(ms);
  await w.settle();
  await w.settle();
}

async function inReview() {
  await w.start({ yaml: CI });
  await w.repo.write(w.tree, { ...storyCard("In Progress"), acs: ACS });
  w.repo.commit(w.tree, "work");
  await w.settle();
  await w.moveOn("In Review");
  return w.repo.git(w.tree, "rev-parse", "HEAD").trim();
}

const ciAt = (sha: string, runs: FakeRun[]) =>
  w.gh.change((s) => {
    s.prs[0]!.checksAt = { ...s.prs[0]!.checksAt, [sha]: [checkRun("SUCCESS")] };
    s.runs = runs;
  });

describe("the CI run kept with its proof (STORY-69 AC4)", () => {
  it("links each proven criterion to the run whose report proved it, and nothing to one not proven", async () => {
    const a = await inReview();
    await ciAt(a, [
      { id: 11, headSha: a, artifacts: { "test-report-ubuntu": { "junit.xml": report("passed", "skipped") } } },
      { id: 12, headSha: a, artifacts: { "test-report-windows": { "junit.xml": report("passed", "passed") } } },
    ]);
    await after(2 * MINUTE);
    const card = await w.read();
    expect([...provenRuns(card)]).toEqual([
      [1, `${RUNS}/11`],
      [2, `${RUNS}/12`],
    ]);
    expect(card.history.filter((e) => e.to?.startsWith("ran:")).map((e) => e.by)).toEqual(["system", "system"]);
  });

  it("drops the link when a new head unproves the criterion", async () => {
    const a = await inReview();
    await ciAt(a, [
      { id: 11, headSha: a, artifacts: { "test-report-ubuntu": { "junit.xml": report("passed", "passed") } } },
    ]);
    await after(2 * MINUTE);
    expect(provenRuns(await w.read()).size).toBe(2);
    await w.moveOn("In Progress");
    w.repo.commit(w.tree, "B");
    await w.moveOn("In Review");
    expect([...provenRuns(await w.read())]).toEqual([]);
  });
});
