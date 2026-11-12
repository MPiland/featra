/**
 * The world of the local-checks tests (STORY-56): a real repository with a story's worktree, the real scanner, watches,
 * card lane, settings and work-format rules. Only the platform is a stand-in: the check command and the linked-test
 * command are small Node scripts of the project. `check.cjs` reads its verdict from a file in the worktree;
 * `run-test.cjs` is a test runner that reads `pass|fail|skip <name>` lines from a test file and writes a JUnit report
 * the way vitest does, for the tests whose names match the pattern it is given (as `-t` does, unanchored).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { parseCard, type Card, type CardChecks } from "@featra/work-format";
import { createAllowedProjects, type AllowedProjects } from "../src/allowed-projects.ts";
import { createCheckSettings, type CheckSettings } from "../src/check-settings.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createStoryChecks, type StoryChecks } from "../src/story-checks.ts";
import { createScanner } from "../src/work-scan.ts";
import { createWorkWatches, type WorkWatches } from "../src/work-watch.ts";
import { card, cardRepo, moved, type CardRepo } from "./card-repo.ts";
import { until } from "./until.ts";

const CHECK = `const fs = require("fs");
fs.appendFileSync("runs.log", "x\\n");
const wait = fs.existsSync("delay.txt") ? Number(fs.readFileSync("delay.txt", "utf8")) : 0;
if (wait) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
if (fs.existsSync("flood.txt")) process.stdout.write("z".repeat(100000));
const verdict = fs.readFileSync("verdict.txt", "utf8").trim();
if (verdict !== "pass") { console.log("boom: " + verdict); process.exit(1); }
`;

const RUN_TEST = `const fs = require("fs");
const [file, pattern, report] = process.argv.slice(2);
fs.appendFileSync("args.log", [file, pattern].join("|") + "\\n");
const cases = fs.readFileSync(file, "utf8").split("\\n").filter(Boolean).map((line) => {
  const at = line.indexOf(" ");
  return { status: line.slice(0, at), name: line.slice(at + 1) };
});
const re = new RegExp(pattern);
const chosen = cases.filter((c) => re.test(c.name));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const body = chosen.map((c) => {
  const inner = c.status === "fail" ? '<failure message="failed"/>' : c.status === "skip" ? "<skipped/>" : "";
  return '<testcase classname="' + file + '" name="' + esc(c.name) + '">' + inner + "</testcase>";
});
fs.writeFileSync(report, '<?xml version="1.0"?><testsuites><testsuite name="' + file + '">' + body.join("") + "</testsuite></testsuites>");
for (const c of chosen) if (c.status === "fail") console.log("test failed: " + c.name);
process.exit(chosen.some((c) => c.status === "fail") ? 1 : 0);
`;

/** A runner that exits 0 and writes no report. */
const NO_REPORT = `require("fs").appendFileSync("args.log", "noreport\\n");`;

export const TEST_COMMAND = "node run-test.cjs {file} {namePattern} {report}";

export interface StartOptions {
  /** More lines of the project's config. */
  yaml?: string;
  /** The linked test command; `null` leaves it out of the config. */
  template?: string | null;
  /** Whether the user has confirmed the commands of the config; true by default. */
  confirm?: boolean;
  /** Stands between the checks and the scanner. */
  scan?: (scan: WorkWatches["scan"]) => WorkWatches["scan"];
}

export interface World {
  repo: CardRepo;
  tree: string;
  checks: StoryChecks;
  watches: WorkWatches;
  settings: CheckSettings;
  /** The story reaches review in its worktree, as a session's report would write it; the checks then run. */
  toReview: (status?: string, extra?: Partial<Card>) => Promise<void>;
  start: (options?: StartOptions) => Promise<void>;
  /** Featra restarts: the checks close, and new ones start on the project as it is now, which is their baseline. */
  restart: () => Promise<void>;
  read: () => Promise<Card>;
  /** The lines of a file of the worktree, empty when there is none. */
  lines: (name: string) => Promise<string[]>;
  inTree: (name: string) => string;
  state: () => CardChecks | undefined;
}

export const clock = new Date("2026-11-12T10:00:00Z");

export const storyCard = (status: string, extra: Partial<Card> = {}): Card => ({
  ...moved(card("STORY-1", "story", "FEAT-1", "In Progress"), status),
  ...extra,
});

/** A story's criteria, each with the test link given (or none). */
export const linked = (...tests: (string | null)[]): Partial<Card> => ({
  acs: tests.map((test, i) => ({ text: `AC ${i + 1}`, done: false, test })),
});

/** Registers the hooks of one test file and returns its world, filled in as the tests run. */
export function checksWorld(): World {
  let allowed: AllowedProjects;
  let scanner: ReturnType<typeof createScanner>;
  let make: () => StoryChecks;
  const w = {} as World;

  w.inTree = (name) => join(w.tree, name);
  w.read = async () => parseCard(await w.repo.read(w.tree, "STORY-1"));
  w.lines = async (name) => (await readFile(w.inTree(name), "utf8").catch(() => "")).split("\n").filter(Boolean);
  w.state = () => w.checks.checksFor(w.repo.main, "STORY-1");
  w.toReview = async (status = "In Review", extra = {}) => {
    await w.repo.write(w.tree, storyCard(status, extra));
    await w.watches.scan(w.repo.main);
    await w.checks.idle();
  };

  w.start = async ({ yaml = "", template = TEST_COMMAND, confirm = true, scan }: StartOptions = {}) => {
    const { repo } = w;
    const linkedLine = template === null ? "" : `linkedTestCommand: ${template}\n`;
    await writeFile(
      join(repo.main, ".featra", "config.yaml"),
      `version: 1\nchecksWhere: local\ncheckCommand: node check.cjs\n${linkedLine}${yaml}`,
    );
    await writeFile(join(repo.main, "check.cjs"), CHECK);
    await writeFile(join(repo.main, "run-test.cjs"), RUN_TEST);
    await writeFile(join(repo.main, "no-report.cjs"), NO_REPORT);
    await writeFile(join(repo.main, "pwn.cjs"), 'require("fs").writeFileSync("pwned.txt", "x");');
    await writeFile(join(repo.main, "verdict.txt"), "pass\n");
    await mkdir(join(repo.main, "test"), { recursive: true });
    await writeFile(
      join(repo.main, "test", "a.test.ts"),
      "pass group works\npass group works fast\npass one\npass three\npass works\nskip later\n",
    );
    await writeFile(join(repo.main, "test", "b.test.ts"), "fail breaks\npass two\n");
    await writeFile(join(repo.main, ".gitignore"), "runs.log\nargs.log\ndelay.txt\nflood.txt\npwned.txt\n");
    repo.commit(repo.main, "project");
    repo.git(repo.main, "branch", "feature/1");
    w.tree = repo.worktree("story-1", "story-1", "feature/1");
    allowed.set([repo.main]);
    w.settings = createCheckSettings({ scan: w.watches.scan, now: () => clock });
    if (confirm) await w.settings.set(repo.main, { confirm: ["command", "testCommand"] });
    make = () =>
      createStoryChecks({
        scan: scan ? scan(w.watches.scan) : w.watches.scan,
        observe: w.watches.observe,
        allowed,
        settings: w.settings,
        now: () => clock,
        log: () => {},
        timeoutMs: 30_000,
      });
    w.checks = make();
    // The watch starts, so what is in review now is the baseline and only a change runs.
    await w.watches.watch(repo.main, () => {});
    await until(() => true);
  };

  w.restart = async () => {
    w.checks.close();
    w.checks = make();
    await until(() => true);
  };

  beforeEach(async () => {
    w.repo = await cardRepo();
    await w.repo.write(w.repo.main, card("FEAT-1", "feature", null, "active"));
    await w.repo.write(w.repo.main, storyCard("In Progress"));
    w.repo.commit(w.repo.main, "plan");
    allowed = createAllowedProjects();
    scanner = createScanner(createRepoGit());
    w.watches = createWorkWatches(scanner, () => {});
  });
  afterEach(async () => {
    w.checks?.close();
    w.watches.close();
    await scanner.close();
    await w.repo.dispose();
  });
  return w;
}
