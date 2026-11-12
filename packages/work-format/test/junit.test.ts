/**
 * STORY-56: what a JUnit report proves about a linked test. The parser and the rule run for real on reports written
 * the way vitest and other runners write them. A name that matches nothing, or is only part of another test's name,
 * proves nothing (the regression tests for proving by exit code).
 */
import { describe, expect, it } from "vitest";
import { parseJUnit, proofFromReport } from "../src/index.ts";

const report = (...cases: string[]) =>
  `<?xml version="1.0" encoding="UTF-8" ?>\n<testsuites name="vitest tests" tests="${cases.length}">\n<testsuite name="test/a.test.ts">\n${cases.join("\n")}\n</testsuite>\n</testsuites>\n`;
const ok = (name: string) => `<testcase classname="test/a.test.ts" name="${name}" time="0.001"></testcase>`;
const bad = (name: string, tag = "failure") =>
  `<testcase classname="test/a.test.ts" name="${name}" time="0.001"><${tag} message="boom" type="AssertionError">at line 3</${tag}></testcase>`;
const skipped = (name: string) => `<testcase classname="test/a.test.ts" name="${name}"><skipped/></testcase>`;
const A = "test/a.test.ts";

describe("reading a report", () => {
  it("reads each test's name, group and result", () => {
    const cases = parseJUnit(report(ok("group > works"), bad("breaks"), bad("errors", "error"), skipped("later")));
    expect(cases).toEqual([
      { name: "group works", classname: A, status: "passed" },
      { name: "breaks", classname: A, status: "failed" },
      { name: "errors", classname: A, status: "failed" },
      { name: "later", classname: A, status: "skipped" },
    ]);
  });

  it("decodes entities, and reads a self-closing test and a > inside a value", () => {
    const cases = parseJUnit(
      report(
        '<testcase name="a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;" classname="x"/>',
        '<testcase name="x > y" classname="x"/>',
      ),
    );
    expect(cases.map((c) => c.name)).toEqual([`a & b <c> "d" 'e'`, "x y"]);
  });

  it("is not fooled by a failure tag inside CDATA or a comment", () => {
    const text =
      '<testcase name="t" classname="x"><system-out><![CDATA[<failure message="no">]]></system-out><!-- <skipped/> --></testcase>';
    expect(parseJUnit(report(text))[0]?.status).toBe("passed");
  });

  it("finds no tests in something that isn't a report", () => {
    expect(parseJUnit("")).toEqual([]);
    expect(parseJUnit("not xml at all")).toEqual([]);
  });
});

describe("what a report proves (AC5)", () => {
  const cases = parseJUnit(
    report(ok("group works"), ok("group works fast"), bad("group breaks"), skipped("group later")),
  );

  it("proves a test the report lists as passed, by its full name", () => {
    expect(proofFromReport(cases, { file: A, name: "group works" })).toEqual({ proven: true });
  });

  it("does not prove a name that matches no test", () => {
    expect(proofFromReport(cases, { file: A, name: "group nothing" })).toMatchObject({ proven: false });
    expect(proofFromReport([], { file: A, name: "group works" })).toMatchObject({ proven: false });
  });

  it("does not prove a name that is only part of another test's name", () => {
    const only = parseJUnit(report(ok("group works fast")));
    expect(proofFromReport(only, { file: A, name: "group works" })).toMatchObject({ proven: false });
    expect(proofFromReport(only, { file: A, name: "works fast" })).toMatchObject({ proven: false });
  });

  it("does not prove a test that failed or was skipped", () => {
    expect(proofFromReport(cases, { file: A, name: "group breaks" })).toMatchObject({ proven: false });
    expect(proofFromReport(cases, { file: A, name: "group later" })).toMatchObject({ proven: false });
  });

  it("proves a whole file only when it has tests and all passed", () => {
    expect(proofFromReport(parseJUnit(report(ok("a"), ok("b"))), { file: A, name: null })).toEqual({ proven: true });
    expect(proofFromReport(cases, { file: A, name: null })).toMatchObject({ proven: false });
    expect(proofFromReport([], { file: A, name: null })).toMatchObject({ proven: false });
  });
});
