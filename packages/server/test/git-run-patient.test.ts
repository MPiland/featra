/**
 * BUG-31: `runGitPatiently` tries a git command again only while another git holds a lock it needs. Git itself is the
 * fake here (it answers what each test sets, in order); the rule and the loop are the product's.
 */
import { describe, expect, it } from "vitest";
import { lockedOut, runGitPatiently, type Run } from "../src/git-run.ts";

const LOCK_LINE = "fatal: Unable to create '/repo/.git/index.lock': File exists.";
const HELP =
  "\n\nAnother git process seems to be running in this repository, e.g.\nan editor opened by 'git commit'.\n";
/** Git's English lock failure, as `git add` prints it. */
const locked: Run = { code: 128, stdout: "", stderr: `${LOCK_LINE}${HELP}` };
/** The same failure from a git whose messages are in German. */
const lockedDe: Run = {
  code: 128,
  stdout: "",
  stderr:
    "Schwerwiegend: Konnte '/repo/.git/index.lock' nicht erstellen: Die Datei existiert bereits.\n\nEin anderer Git-Prozess scheint in diesem Repository ausgeführt zu werden.\n",
};
const ok: Run = { code: 0, stdout: "done\n", stderr: "" };
const ignored: Run = {
  code: 1,
  stdout: "",
  stderr: "The following paths are ignored by one of your .gitignore files:\nx.md\n",
};
/** A pre-commit hook whose own git hit a lock: the commit fails, but its first line is the hook's. */
const hookLocked: Run = { code: 128, stdout: "", stderr: `running checks\n${LOCK_LINE}\n` };

/** A git that answers `runs` in order, and counts how often it was started. */
function fakeGit(...runs: Run[]) {
  const started: string[][] = [];
  const run = (_command: string, _dir: string, args: string[]) => {
    started.push(args);
    return Promise.resolve(runs[Math.min(started.length - 1, runs.length - 1)] as Run);
  };
  return { run, started };
}

describe("which failures mean another git holds a lock (BUG-31)", () => {
  it("is git's fatal exit with a lock file named on the first line, in any language", () => {
    expect(lockedOut(locked)).toBe(true);
    expect(lockedOut(lockedDe)).toBe(true);
  });

  it("is not a failure for another reason, a success, or a lock named after the first line", () => {
    expect(lockedOut(ignored)).toBe(false);
    expect(lockedOut(ok)).toBe(false);
    expect(lockedOut(hookLocked)).toBe(false);
    expect(lockedOut({ ...locked, code: 1 })).toBe(false);
  });
});

describe("running git patiently (BUG-31)", () => {
  it("returns at once when git succeeds", async () => {
    const git = fakeGit(ok);
    expect(await runGitPatiently("git", "/repo", ["add"], [1, 1], git.run)).toBe(ok);
    expect(git.started).toHaveLength(1);
  });

  it("doesn't try again when git failed for another reason", async () => {
    const git = fakeGit(ignored, ok);
    expect(await runGitPatiently("git", "/repo", ["add"], [1, 1], git.run)).toBe(ignored);
    expect(git.started).toHaveLength(1);
  });

  it("doesn't try again when only a hook's own git was locked out, so the hooks don't run twice", async () => {
    const git = fakeGit(hookLocked, ok);
    expect(await runGitPatiently("git", "/repo", ["commit"], [1, 1], git.run)).toBe(hookLocked);
    expect(git.started).toHaveLength(1);
  });

  it("tries again while the lock is held, in a git that speaks German too, and returns what worked", async () => {
    const git = fakeGit(lockedDe, locked, ok);
    expect(await runGitPatiently("git", "/repo", ["add", "-A"], [1, 1, 1], git.run)).toBe(ok);
    expect(git.started).toEqual([
      ["add", "-A"],
      ["add", "-A"],
      ["add", "-A"],
    ]);
  });

  it("gives up after one try per wait and returns the last failure", async () => {
    const last: Run = { ...locked, stderr: `${LOCK_LINE} (last)` };
    const git = fakeGit(locked, locked, last);
    expect(await runGitPatiently("git", "/repo", ["add"], [1, 1], git.run)).toBe(last);
    expect(git.started).toHaveLength(3);
  });
});
