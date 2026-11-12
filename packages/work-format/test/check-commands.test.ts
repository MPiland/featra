/**
 * STORY-56: the commands behind local checks: what a criterion links, how a linked test's command is made from the
 * project's template without card text reaching the shell, and what Featra proposes from the project's files.
 */
import { describe, expect, it } from "vitest";
import {
  fileCommand,
  groupByFile,
  isTestFile,
  parseTestRefs,
  proposeCommands,
  quoteArg,
  runsWithTemplate,
  testCommand,
  writesReport,
} from "../src/index.ts";

describe("linked tests from a criterion (AC5)", () => {
  it("reads a file with a test name after ::, joining describe and test names", () => {
    expect(parseTestRefs("packages/a/test/x.test.ts::group > does it")).toEqual([
      { file: "packages/a/test/x.test.ts", name: "group does it" },
    ]);
  });

  it("reads a whole file and a quoted name", () => {
    expect(parseTestRefs("test/x.test.ts")).toEqual([{ file: "test/x.test.ts", name: null }]);
    expect(parseTestRefs('test/x.test.ts "does it"')).toEqual([{ file: "test/x.test.ts", name: "does it" }]);
  });

  it("reads several separated by ; and leaves prose out", () => {
    const refs = parseTestRefs("a/x.test.ts::one; b/y.spec.ts::two > three; see the docs");
    expect(refs).toEqual([
      { file: "a/x.test.ts", name: "one" },
      { file: "b/y.spec.ts", name: "two three" },
    ]);
    expect(parseTestRefs("see the docs")).toEqual([]);
    expect(parseTestRefs(null)).toEqual([]);
  });

  it("accepts only safe relative test files", () => {
    expect(isTestFile("test/x.test.ts")).toBe(true);
    expect(isTestFile("../x.test.ts")).toBe(false);
    expect(isTestFile("/etc/x.test.ts")).toBe(false);
    expect(isTestFile("C:/x.test.ts")).toBe(false);
    expect(isTestFile("x.ts")).toBe(false);
  });
});

describe("shell quoting (no injection)", () => {
  it("single-quotes on POSIX and escapes quotes inside", () => {
    expect(quoteArg("a b", "linux")).toEqual({ ok: true, arg: "'a b'" });
    expect(quoteArg("it's $(x)", "linux")).toEqual({ ok: true, arg: String.raw`'it'\''s $(x)'` });
  });

  it("double-quotes on Windows and refuses what cmd would read", () => {
    expect(quoteArg("a b", "win32")).toEqual({ ok: true, arg: '"a b"' });
    for (const bad of ['a"b', "50%", "a^b", "a!b"]) expect(quoteArg(bad, "win32").ok).toBe(false);
  });

  it("refuses a line break everywhere", () => {
    expect(quoteArg("a\nb", "linux").ok).toBe(false);
    expect(quoteArg("a\0b", "win32").ok).toBe(false);
  });

  it("fills the template with quoted values only", () => {
    const ref = { file: "test/x.test.ts", name: "does (it) $HOME" };
    expect(testCommand("npx vitest run {file} -t {name}", ref, "linux")).toEqual({
      ok: true,
      command: "npx vitest run 'test/x.test.ts' -t 'does (it) $HOME'",
    });
  });

  it("escapes the name for a pattern in {namePattern}", () => {
    const made = testCommand("run {namePattern}", { file: "a.test.ts", name: "a (b)" }, "linux");
    expect(made).toEqual({ ok: true, command: String.raw`run 'a \(b\)'` });
  });

  it("never reads a value as a placeholder", () => {
    const made = testCommand("run {name} {file}", { file: "a.test.ts", name: "{file}" }, "linux");
    expect(made).toEqual({ ok: true, command: "run '{file}' 'a.test.ts'" });
  });

  it("refuses a file outside the project and a name the shell would read", () => {
    expect(testCommand("run {file}", { file: "../x.test.ts", name: null }, "linux").ok).toBe(false);
    expect(testCommand("run {name}", { file: "a.test.ts", name: "100%" }, "win32").ok).toBe(false);
  });
});

const pkg = (extra: object = {}) => JSON.stringify({ scripts: { test: "vitest run" }, ...extra });

describe("commands proposed from the project's files (AC2)", () => {
  it("proposes the test script through the package manager the lockfile names", () => {
    expect(proposeCommands({ packageJson: pkg(), lockfiles: [] })[0]).toEqual({
      field: "command",
      value: "npm test",
      source: "package.json",
    });
    expect(proposeCommands({ packageJson: pkg(), lockfiles: ["pnpm-lock.yaml"] })[0]?.value).toBe("pnpm test");
    expect(proposeCommands({ packageJson: pkg(), lockfiles: ["yarn.lock"] })[0]?.value).toBe("yarn test");
    expect(proposeCommands({ packageJson: pkg(), lockfiles: ["bun.lock"] })[0]?.value).toBe("bun run test");
  });

  it("proposes a linked-test template that writes a JUnit report, for a runner that can", () => {
    const found = proposeCommands({
      packageJson: pkg({ devDependencies: { vitest: "1" } }),
      lockfiles: ["pnpm-lock.yaml"],
    });
    const template = found.find((p) => p.field === "testCommand")?.value;
    expect(template).toBe("pnpm exec vitest run {file} -t {namePattern} --reporter=junit --outputFile={report}");
    expect(writesReport(template ?? "")).toBe(true);
  });

  it("proposes no linked-test command for a runner that can't write a report to a path", () => {
    const jest = proposeCommands({ packageJson: pkg({ dependencies: { jest: "1" } }), lockfiles: [] });
    expect(jest.find((p) => p.field === "testCommand")).toBeUndefined();
  });

  it("proposes nothing without a test script, with bad JSON, or without package.json", () => {
    expect(proposeCommands({ packageJson: JSON.stringify({ scripts: {} }), lockfiles: [] })).toEqual([]);
    expect(proposeCommands({ packageJson: "{nope", lockfiles: [] })).toEqual([]);
    expect(proposeCommands({ packageJson: null, lockfiles: [] })).toEqual([]);
  });
});

describe("one run per test file (AC5)", () => {
  it("groups the linked tests by file, and a whole-file link covers the file's names", () => {
    expect(
      groupByFile([
        { file: "a.test.ts", name: "one" },
        { file: "b.test.ts", name: "x" },
        { file: "a.test.ts", name: "two" },
        { file: "a.test.ts", name: "one" },
      ]),
    ).toEqual([
      { file: "a.test.ts", names: ["one", "two"] },
      { file: "b.test.ts", names: ["x"] },
    ]);
    expect(
      groupByFile([
        { file: "a.test.ts", name: "one" },
        { file: "a.test.ts", name: null },
      ]),
    ).toEqual([{ file: "a.test.ts", names: [] }]);
  });

  it("fills {namePattern} with every name as alternatives, and {report} with the path", () => {
    const group = { file: "a.test.ts", names: ["a (b)", "c"] };
    const made = fileCommand("run {file} -t {namePattern} -o {report}", group, "linux", "/tmp/r.xml");
    expect(made).toEqual({ ok: true, command: String.raw`run 'a.test.ts' -t 'a \(b\)|c' -o '/tmp/r.xml'` });
  });

  it("refuses {name} for a file with several linked tests, and a report with nowhere to go", () => {
    expect(fileCommand("run {name}", { file: "a.test.ts", names: ["a", "b"] }, "linux").ok).toBe(false);
    expect(fileCommand("run -o {report}", { file: "a.test.ts", names: [] }, "linux").ok).toBe(false);
  });

  it("quotes the report path like any other value, so a path the shell would read is refused", () => {
    const made = fileCommand("run -o {report}", { file: "a.test.ts", names: [] }, "win32", "C:\\100%\\r.xml");
    expect(made.ok).toBe(false);
  });
});

describe("which test files the template can run (AC5)", () => {
  it("covers unit test files and not browser or end-to-end suites", () => {
    expect(runsWithTemplate("packages/a/test/x.test.ts")).toBe(true);
    expect(runsWithTemplate("apps/desktop/e2e/local-checks.spec.ts")).toBe(false);
    expect(runsWithTemplate("e2e/a.spec.ts")).toBe(false);
    expect(runsWithTemplate("tests/playwright/a.spec.ts")).toBe(false);
    expect(runsWithTemplate("test/cypress/a.test.ts")).toBe(false);
  });

  it("knows whether a template writes a report", () => {
    expect(writesReport("vitest run {file}")).toBe(false);
    expect(writesReport("vitest run {file} --outputFile={report}")).toBe(true);
  });
});
