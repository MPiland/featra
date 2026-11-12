/**
 * STORY-56: where checks run, what a run proves, and the commands behind it. The rules run for real; only card data is
 * built here (fixtures.ts calls work-format's own constructors).
 */
import { describe, expect, it } from "vitest";
import {
  checksApply,
  checksSetParams,
  CHECKS_COPY,
  checksWhere,
  COMMAND_MAX,
  ConfigError,
  DEFAULT_CONFIG,
  defaultChecksWhere,
  evidenceState,
  isTestFile,
  normalizeCardChecks,
  parseConfig,
  parseTestRefs,
  proposeCommands,
  quoteArg,
  recordAcceptance,
  recordEvidence,
  reviewStage,
  testCommand,
  withCheckEvidence,
  type Card,
  type GithubDetection,
} from "../src/index.ts";
import { at, config, moves, story } from "./fixtures.ts";

const github = (over: Partial<GithubDetection> = {}): GithubDetection => ({
  remote: true,
  workflows: true,
  public: true,
  ...over,
});

const withAcs = (card: Card, count: number): Card => ({
  ...card,
  acs: Array.from({ length: count }, (_, i) => ({ text: `AC ${i + 1}`, done: false, test: null })),
});

describe("where checks run by default (AC1)", () => {
  it("is CI for a public GitHub repo with workflows", () => {
    expect(defaultChecksWhere(github())).toEqual({ where: "ci", reason: CHECKS_COPY.ci });
  });

  it.each([
    ["no GitHub remote", github({ remote: false }), CHECKS_COPY.noGithub],
    ["no workflows", github({ workflows: false }), CHECKS_COPY.noWorkflows],
    ["a private repo", github({ public: false }), CHECKS_COPY.notPublic],
    ["visibility unknown", github({ public: null }), CHECKS_COPY.notPublic],
  ])("is this computer with %s", (_name, found, reason) => {
    expect(defaultChecksWhere(found)).toEqual({ where: "local", reason });
  });

  it("is the project's own choice when it made one", () => {
    expect(checksWhere({ ...config, checksWhere: "local" }, github())).toBe("local");
    expect(checksWhere({ ...config, checksWhere: "ci" }, github({ remote: false }))).toBe("ci");
    expect(checksWhere(config, github())).toBe("ci");
  });
});

const yaml = (key: string, value: string) => `${key}: ${JSON.stringify(value)}\n`;

describe("the checks settings in config.yaml (AC1, AC2)", () => {
  it("have no value until the user confirms one", () => {
    expect(DEFAULT_CONFIG.checksWhere).toBeNull();
    expect(DEFAULT_CONFIG.checkCommand).toBeNull();
    expect(DEFAULT_CONFIG.linkedTestCommand).toBeNull();
  });

  it("are read from the file", () => {
    const parsed = parseConfig(
      "checksWhere: local\ncheckCommand: pnpm test\nlinkedTestCommand: npx vitest run {file} -t {name}\n",
    );
    expect(parsed.checksWhere).toBe("local");
    expect(parsed.checkCommand).toBe("pnpm test");
    expect(parsed.linkedTestCommand).toBe("npx vitest run {file} -t {name}");
  });

  it("refuse a bad place and a command that is empty, too long or has a line break", () => {
    expect(() => parseConfig(yaml("checksWhere", "nowhere"))).toThrow(ConfigError);
    expect(() => parseConfig(yaml("checkCommand", ""))).toThrow(ConfigError);
    expect(() => parseConfig(yaml("linkedTestCommand", "a".repeat(COMMAND_MAX + 1)))).toThrow(ConfigError);
    expect(() => parseConfig(yaml("checkCommand", "a\nb"))).toThrow(ConfigError);
  });
});

describe("when checks apply to a story (AC3)", () => {
  it("names the review stage as In Review by default", () => {
    expect(reviewStage(config)).toBe("In Review");
  });

  it("applies in In Review and Acceptance, not while it is being built", () => {
    const base = story("STORY-1", "FEAT-1");
    expect(checksApply(moves(base, [1, "In Progress"]), config)).toBe(false);
    expect(checksApply(moves(base, [1, "In Progress"], [2, "In Review"]), config)).toBe(true);
    expect(checksApply(moves(base, [1, "In Progress"], [2, "In Review"], [3, "Acceptance"]), config)).toBe(true);
    expect(checksApply(moves(base, [1, "In Progress"], [2, "In Review"], [3, "Acceptance"], [4, "Done"]), config)).toBe(
      false,
    );
  });

  it("applies to stories only", () => {
    const bug = story("BUG-1", "FEAT-1", { type: "bug" });
    expect(checksApply(moves(bug, [1, "In Progress"], [2, "In Review"]), config)).toBe(false);
  });
});

const reviewing = () => withAcs(moves(story("STORY-1", "FEAT-1"), [1, "In Progress"], [2, "In Review"]), 2);

describe("what a run proves (AC4, AC5)", () => {
  it("marks the story Verified when the check command passes, by system", () => {
    const next = withCheckEvidence(reviewing(), config, { passed: true, acs: [] }, "system", at(5));
    expect(evidenceState(next).verified).toBe(true);
    expect(next.history.at(-1)).toMatchObject({ by: "system", field: "evidence", to: "verified" });
  });

  it("removes Verified when it fails", () => {
    const verified = recordEvidence(reviewing(), "verified", "system", at(4));
    const next = withCheckEvidence(verified, config, { passed: false, acs: [] }, "system", at(5));
    expect(evidenceState(next).verified).toBe(false);
    expect(next.history.at(-1)).toMatchObject({ field: "evidence", to: "unverified" });
  });

  it("keeps Verified when the check command wasn't run", () => {
    const verified = recordEvidence(reviewing(), "verified", "system", at(4));
    expect(withCheckEvidence(verified, config, { passed: null, acs: [] }, "system", at(5))).toBe(verified);
  });

  it("marks a criterion Proven when its linked test passes and not Proven when it fails", () => {
    const proven = withCheckEvidence(
      reviewing(),
      config,
      { passed: null, acs: [{ ac: 2, passed: true }] },
      "system",
      at(5),
    );
    expect(evidenceState(proven).provenAcs).toEqual([2]);
    const failed = withCheckEvidence(
      proven,
      config,
      { passed: null, acs: [{ ac: 2, passed: false }] },
      "system",
      at(6),
    );
    expect(evidenceState(failed).provenAcs).toEqual([]);
  });

  it("records nothing when a run changes nothing", () => {
    const first = withCheckEvidence(
      reviewing(),
      config,
      { passed: true, acs: [{ ac: 1, passed: true }] },
      "system",
      at(5),
    );
    const again = withCheckEvidence(first, config, { passed: true, acs: [{ ac: 1, passed: true }] }, "system", at(6));
    expect(again).toBe(first);
  });

  it("ignores a criterion number the card doesn't have", () => {
    const card = reviewing();
    expect(withCheckEvidence(card, config, { passed: null, acs: [{ ac: 9, passed: true }] }, "system", at(5))).toBe(
      card,
    );
  });

  it("moves a story the user already accepted to Done when Verified arrives", () => {
    const waiting = recordAcceptance(
      moves(withAcs(story("STORY-1", "FEAT-1"), 1), [1, "In Progress"], [2, "In Review"], [3, "Acceptance"]),
      true,
      "user",
      at(4),
    );
    const next = withCheckEvidence(waiting, config, { passed: true, acs: [] }, "system", at(5));
    expect(next.status).toBe("Done");
    expect(next.history.at(-1)).toMatchObject({ from: "Acceptance", to: "Done", by: "system" });
  });
});

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

  it("proposes a linked-test template for the runner the project depends on", () => {
    const found = proposeCommands({
      packageJson: pkg({ devDependencies: { vitest: "1" } }),
      lockfiles: ["pnpm-lock.yaml"],
    });
    expect(found.find((p) => p.field === "testCommand")?.value).toBe("pnpm exec vitest run {file} -t {namePattern}");
    const jest = proposeCommands({ packageJson: pkg({ dependencies: { jest: "1" } }), lockfiles: [] });
    expect(jest.find((p) => p.field === "testCommand")?.value).toBe("npx jest {file} -t {namePattern}");
  });

  it("proposes nothing without a test script, with bad JSON, or without package.json", () => {
    expect(proposeCommands({ packageJson: JSON.stringify({ scripts: {} }), lockfiles: [] })).toEqual([]);
    expect(proposeCommands({ packageJson: "{nope", lockfiles: [] })).toEqual([]);
    expect(proposeCommands({ packageJson: null, lockfiles: [] })).toEqual([]);
  });
});

describe("what crosses the socket", () => {
  it("reads a patch and refuses a bad one", () => {
    expect(checksSetParams({ dir: "d", patch: { where: "local", command: null } })).toEqual({
      dir: "d",
      patch: { where: "local", command: null },
    });
    expect(checksSetParams({ dir: "d", patch: { where: "mars" } })).toBeNull();
    expect(checksSetParams({ dir: "d", patch: { command: 3 } })).toBeNull();
    expect(checksSetParams({ patch: {} })).toBeNull();
  });

  it("reads the card's checks defensively", () => {
    expect(normalizeCardChecks(null)).toBeUndefined();
    expect(
      normalizeCardChecks({ running: true, failedAcs: [1, "x"], last: { passed: false, output: "boom" } }),
    ).toEqual({
      running: true,
      idle: null,
      last: { passed: false, command: "", at: "", output: "boom" },
      failedAcs: [1],
      note: null,
    });
  });
});
