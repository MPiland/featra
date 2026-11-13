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
  normalizeCardChecks,
  parseConfig,
  recordAcceptance,
  recordEvidence,
  reviewStage,
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
    ["visibility unknown", github({ public: null }), CHECKS_COPY.unknown],
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

  it("reads a confirm patch of known commands, once each, and refuses an unknown one", () => {
    expect(checksSetParams({ dir: "d", patch: { confirm: ["command", "testCommand", "command"] } })).toEqual({
      dir: "d",
      patch: { confirm: ["command", "testCommand"] },
    });
    expect(checksSetParams({ dir: "d", patch: { confirm: ["where"] } })).toBeNull();
    expect(checksSetParams({ dir: "d", patch: { confirm: "command" } })).toBeNull();
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
