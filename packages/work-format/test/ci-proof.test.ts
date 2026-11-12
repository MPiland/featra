/**
 * STORY-57: the rules of proving criteria from CI's test reports. Real parser, merge and proof rules on reports written
 * the way vitest writes them; only the card and the reports are made up.
 */
import { describe, expect, it } from "vitest";
import {
  buildCardView,
  CI_PROOF_COPY,
  ciProof,
  ConfigError,
  configOverrides,
  isReportArtifact,
  isReportFile,
  isReportFiles,
  mergeReports,
  normalizeCardPr,
  parseChecksPatch,
  provenEvent,
  recordEvidence,
  parseConfig,
  parseJUnit,
  sameFile,
  type Card,
  type JUnitCase,
} from "../src/index.ts";
import { at, config, feature, story } from "./fixtures.ts";

/** A story in review whose criteria link the tests given, one per criterion (null: none). */
const storyWith = (links: (string | null)[]): Card => ({
  ...story("STORY-4", "FEAT-2", { status: "In Review" }),
  acs: links.map((test, i) => ({ text: `Criterion ${i + 1}`, done: false, test })),
});

const A = "packages/app/test/a.test.ts";
const B = "apps/desktop/e2e/b.spec.ts";
const test = (classname: string, name: string, status: JUnitCase["status"] = "passed"): JUnitCase => ({
  classname,
  name,
  status,
});

describe("which file a report's test belongs to", () => {
  it("matches the same path, a path from a package folder, or a longer path ending in it", () => {
    expect(sameFile(A, A)).toBe(true);
    expect(sameFile("./packages/app/test/a.test.ts", A)).toBe(true);
    expect(sameFile("test/a.test.ts", A)).toBe(true);
    expect(sameFile(`/home/runner/work/app/${A}`, A)).toBe(true);
    expect(sameFile(String.raw`packages\app\test\a.test.ts`, A)).toBe(true);
  });

  it("never matches another file that only ends in the same letters", () => {
    expect(sameFile("test/aa.test.ts", "test/a.test.ts")).toBe(false);
    expect(sameFile("packages/other/test/a.test.ts", A)).toBe(false);
    expect(sameFile("", A)).toBe(false);
  });
});

describe("several reports read as one", () => {
  it("fails a test that failed in any report, even when it passed in another", () => {
    const merged = mergeReports([[test(A, "works")], [test(A, "works", "failed")], [test(A, "works")]]);
    expect(merged).toEqual([test(A, "works", "failed")]);
  });

  it("passes a test skipped in one report and passed in another", () => {
    expect(mergeReports([[test(A, "works", "skipped")], [test(A, "works")]])).toEqual([test(A, "works")]);
  });

  it("keeps a test skipped everywhere as skipped, and tests of other files apart", () => {
    const merged = mergeReports([[test(A, "works", "skipped")], [test(B, "works")]]);
    expect(merged).toEqual([test(A, "works", "skipped"), test(B, "works")]);
  });

  it("reads the same file under the two spellings of its path as one", () => {
    expect(mergeReports([[test(`./${A}`, "works", "failed")], [test(A, "works")]])).toHaveLength(1);
  });
});

describe("what CI's report proves of a story (AC2, AC3)", () => {
  const card = storyWith([
    `${A}::group > works`,
    `${A}::group > breaks`,
    `${A}::group > absent`,
    null,
    `${B}::journey > opens`,
    `${A}::group > later`,
  ]);
  const cases = parseJUnit(`<testsuites>
    <testcase classname="${A}" name="group &gt; works"/>
    <testcase classname="${A}" name="group &gt; breaks"><failure message="no"/></testcase>
    <testcase classname="${A}" name="group &gt; works too"/>
    <testcase classname="${A}" name="group &gt; later"><skipped/></testcase>
    <testcase classname="${B}" name="journey &gt; opens"/>
  </testsuites>`);

  it("proves each criterion whose linked test passed, an end-to-end test included", () => {
    const { acs } = ciProof(card, cases);
    expect(acs).toEqual([
      { ac: 1, passed: true },
      { ac: 2, passed: false },
      { ac: 3, passed: false },
      { ac: 5, passed: true },
      { ac: 6, passed: false },
    ]);
  });

  it("says which failed and which are missing from the report or were skipped, and why", () => {
    const { proof } = ciProof(card, cases, null);
    expect(proof).toEqual({
      failedAcs: [2],
      missingAcs: [3, 6],
      reasons: [
        'AC 2: "group breaks" failed.',
        'AC 3: No test named "group absent" ran.',
        'AC 6: "group later" was skipped.',
      ],
      note: null,
    });
  });

  it("never proves a criterion by a test of the same name in another file, or by part of a name", () => {
    const other = storyWith([`${A}::journey > opens`, `${A}::group > work`]);
    const { acs, proof } = ciProof(other, cases);
    expect(acs).toEqual([
      { ac: 1, passed: false },
      { ac: 2, passed: false },
    ]);
    expect(proof.missingAcs).toEqual([1, 2]);
  });

  it("proves a whole-file link only when every test of that file passed, and says when none ran", () => {
    const whole = storyWith([B, A, "packages/app/test/none.test.ts"]);
    const { acs, proof } = ciProof(whole, cases);
    expect(acs.map((a) => a.passed)).toEqual([true, false, false]);
    expect(proof.failedAcs).toEqual([2]);
    expect(proof.missingAcs).toEqual([3]);
    expect(proof.reasons.at(-1)).toBe(`AC 3: ${CI_PROOF_COPY.noFile("packages/app/test/none.test.ts")}`);
  });

  it("needs every test a criterion links, and calls it failed when any of them failed", () => {
    const both = storyWith([`${A}::group > works; ${A}::group > absent`, `${A}::group > absent; ${A}::group > breaks`]);
    const { acs, proof } = ciProof(both, cases);
    expect(acs).toEqual([
      { ac: 1, passed: false },
      { ac: 2, passed: false },
    ]);
    expect(proof.missingAcs).toEqual([1]);
    expect(proof.failedAcs).toEqual([2]);
  });

  it("with no report, leaves every linked criterion missing, with the note", () => {
    const { acs, proof } = ciProof(card, [], CI_PROOF_COPY.noReport);
    expect(acs.every((a) => !a.passed)).toBe(true);
    expect(proof.missingAcs).toEqual([1, 2, 3, 5, 6]);
    expect(proof.note).toBe(CI_PROOF_COPY.noReport);
  });

  it("shows each criterion's proof on the card: passed, failed, or not in the report", () => {
    const proven = recordEvidence(card, provenEvent(1), "system", at(9));
    const { proof } = ciProof(card, cases);
    const tree = { kind: "worktree" as const, branch: "story-4", path: "/w/story-4" };
    const view = buildCardView(
      { card: proven, owner: tree, shownFrom: tree, path: ".featra/cards/STORY-4.md" },
      true,
      { config, cards: [feature("FEAT-2"), proven] },
      undefined,
      { status: { state: "open", checks: "passing" }, create: false, opening: false, note: null, report: proof },
    );
    expect(view.acs.map((a) => a.proof)).toEqual(["passed", "failed", "missing", "none", "linked", "missing"]);
    expect(view.prState?.report).toEqual(proof);
  });
});

describe("test names joined by another runner's separator", () => {
  it("reads Playwright's '›' like vitest's '>', in the report and in the link", () => {
    const cases = parseJUnit(`<testsuites>
      <testcase classname="${B}" name="journey › opens"/>
      <testcase classname="${A}" name="group &gt; works"/>
    </testsuites>`);
    expect(cases.map((c) => c.name)).toEqual(["journey opens", "group works"]);
    const card = storyWith([`${B}::journey > opens`, `${A}::group › works`, `${B}::journey›opens`]);
    expect(ciProof(card, cases).acs).toEqual([
      { ac: 1, passed: true },
      { ac: 2, passed: true },
      { ac: 3, passed: false },
    ]);
  });
});

const ambiguous = (ac: number, file: string) => `AC ${ac}: ${CI_PROOF_COPY.ambiguous(file)}`;

describe("a report path that could be more than one linked file", () => {
  const inA = "packages/a/test/inbox.test.ts";
  const inB = "packages/b/test/inbox.test.ts";

  it("never proves two links that share the report's shorter path, when one of the files is absent", () => {
    const card = storyWith([`${inA}::inbox > opens`, `${inB}::inbox > opens`]);
    const { acs, proof } = ciProof(card, [test("test/inbox.test.ts", "inbox opens")]);
    expect(acs).toEqual([
      { ac: 1, passed: false },
      { ac: 2, passed: false },
    ]);
    expect(proof.missingAcs).toEqual([1, 2]);
    expect(proof.reasons).toEqual([ambiguous(1, inA), ambiguous(2, inB)]);
  });

  it("never proves a link that two different shorter report paths could both be", () => {
    const card = storyWith([`${inA}::inbox > opens`]);
    const cases = [test("a/test/inbox.test.ts", "inbox opens"), test("test/inbox.test.ts", "inbox opens")];
    const { acs, proof } = ciProof(card, cases);
    expect(acs).toEqual([{ ac: 1, passed: false }]);
    expect(proof.missingAcs).toEqual([1]);
    expect(proof.reasons).toEqual([ambiguous(1, inA)]);
  });

  it("trusts the report's full path over a shorter one that may be another package's file", () => {
    const card = storyWith([`${inA}::inbox > opens`]);
    const cases = [test(inA, "inbox opens"), test("test/inbox.test.ts", "inbox opens", "failed")];
    expect(ciProof(card, cases).acs).toEqual([{ ac: 1, passed: true }]);
  });

  it("reads one file's tests from runners on different machines as one", () => {
    const card = storyWith([`${A}::works`]);
    const cases = [test(`/home/runner/work/app/${A}`, "works"), test(`D:/a/app/${A}`, "works", "skipped")];
    expect(ciProof(card, cases).acs).toEqual([{ ac: 1, passed: true }]);
  });
});

describe("the report files inside the artifact", () => {
  it("reads every .xml file when no files are set", () => {
    expect(isReportFile(null, "junit.xml")).toBe(true);
    expect(isReportFile(null, "reports/unit/junit.XML")).toBe(true);
    expect(isReportFile(null, "trace.zip")).toBe(false);
  });

  it("reads the files a path or glob names", () => {
    expect(isReportFile("junit.xml", "junit.xml")).toBe(true);
    expect(isReportFile("junit.xml", "unit/junit.xml")).toBe(false);
    expect(isReportFile("reports/*.xml", "reports/unit.xml")).toBe(true);
    expect(isReportFile("reports/*.xml", "reports/deep/unit.xml")).toBe(false);
    expect(isReportFile("reports/**", "reports/deep/unit.xml")).toBe(true);
    expect(isReportFile("**/junit-?.xml", "a/b/junit-1.xml")).toBe(true);
    expect(isReportFile("**/junit-?.xml", "junit-1.xml")).toBe(true);
    expect(isReportFile("junit.xml", "junitXxml")).toBe(false);
  });
});

describe("the test report setting (AC1)", () => {
  it("is off until the artifact is set", () => {
    const off = parseConfig("version: 1\n");
    expect(off.testReportArtifact).toBeNull();
    expect(off.testReportFiles).toBeNull();
  });

  it("reads the artifact and the report files from the project's config", () => {
    const set = parseConfig("testReportArtifact: test-report-*\ntestReportFiles: reports/**/*.xml\n");
    expect(set).toMatchObject({ testReportArtifact: "test-report-*", testReportFiles: "reports/**/*.xml" });
  });

  it("refuses an artifact or files no shell could safely be given, or that leave the artifact", () => {
    for (const bad of ["a b", 'a"b', "a;b", "a%b", "x".repeat(101)]) expect(isReportArtifact(bad)).toBe(false);
    for (const bad of ["../x.xml", "/x.xml", "a//b.xml", "./x.xml", "a b.xml", "x\\y.xml"])
      expect(isReportFiles(bad)).toBe(false);
    expect(() => configOverrides("testReportArtifact: 'a b'\n")).toThrow(ConfigError);
    expect(() => configOverrides("testReportFiles: ../junit.xml\n")).toThrow(ConfigError);
  });

  it("refuses a leading '-', which gh would read as an option", () => {
    for (const bad of ["-p", "--help", "-test-report"]) expect(isReportArtifact(bad)).toBe(false);
    for (const bad of ["-x.xml", "--output", "-reports/*.xml"]) expect(isReportFiles(bad)).toBe(false);
    expect(isReportArtifact("test-report-")).toBe(true);
    expect(isReportFiles("reports/-unit.xml")).toBe(true);
    expect(() => configOverrides("testReportArtifact: -p\n")).toThrow(ConfigError);
    expect(parseChecksPatch({ testReportFiles: "-x.xml" })).toBeNull();
  });

  it("takes a change from Project settings, where null clears it", () => {
    expect(parseChecksPatch({ testReportArtifact: "test-report", testReportFiles: null })).toEqual({
      testReportArtifact: "test-report",
      testReportFiles: null,
    });
    expect(parseChecksPatch({ testReportArtifact: "a b" })).toBeNull();
    expect(parseChecksPatch({ testReportFiles: "../x" })).toBeNull();
  });

  it("keeps CI's proof on the PR read from the socket, and leaves a PR without one as it was", () => {
    const report = { failedAcs: [2], missingAcs: [3], reasons: ["AC 2: x"], note: null };
    const pr = { status: null, create: false, opening: false, note: null };
    expect(normalizeCardPr({ ...pr, report })).toEqual({ ...pr, report });
    expect(normalizeCardPr(pr)).toEqual(pr);
  });
});
