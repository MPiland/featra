import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REPO } from "./run.ts";

/**
 * The real `.githooks/pre-commit` and the real installer, in a throwaway repository and a worktree of it. Only the
 * platform is faked: `pnpm` is a stub on PATH that records its arguments and passes or fails on demand, so the test
 * proves the hook runs the gate and blocks on failure without running the whole gate again.
 */
const root = mkdtempSync(join(tmpdir(), "featra-hook-"));
const repo = join(root, "repo");
const worktree = join(root, "worktree");
const bin = join(root, "bin");
const calls = join(root, "pnpm-calls.txt");

/**
 * The environment without git's own variables. Run from the pre-commit hook, the gate inherits GIT_DIR, GIT_INDEX_FILE
 * and the like, which would point every git call here at the repository being committed instead of the temp one.
 */
const outsideGit = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
/** Windows spells it `Path`; setting a second `PATH` beside it leaves which one wins to chance. */
const pathKey = Object.keys(outsideGit).find((name) => name.toUpperCase() === "PATH") ?? "PATH";

function env(pnpmExit: number): NodeJS.ProcessEnv {
  return {
    ...outsideGit,
    [pathKey]: `${bin}${delimiter}${outsideGit[pathKey] ?? ""}`,
    FAKE_PNPM_EXIT: String(pnpmExit),
    FAKE_PNPM_CALLS: calls,
    GIT_CEILING_DIRECTORIES: root,
  };
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env: env(0), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function commit(cwd: string, file: string, pnpmExit: number) {
  writeFileSync(join(cwd, file), `${file}\n`);
  git(cwd, "add", file);
  rmSync(calls, { force: true });
  const result = spawnSync("git", ["commit", "-m", `add ${file}`], { cwd, env: env(pnpmExit), encoding: "utf8" });
  return {
    status: result.status,
    gateArgs: existsSync(calls) ? readFileSync(calls, "utf8").trim() : null,
    committed: git(cwd, "log", "--format=%s").split("\n").includes(`add ${file}`),
  };
}

beforeAll(() => {
  mkdirSync(bin);
  // Git runs hooks with its own sh (Git Bash on Windows), so a sh script named `pnpm` is found first on PATH.
  writeFileSync(join(bin, "pnpm"), '#!/bin/sh\necho "$@" >> "$FAKE_PNPM_CALLS"\nexit "$FAKE_PNPM_EXIT"\n');
  chmodSync(join(bin, "pnpm"), 0o755);
  mkdirSync(join(repo, ".githooks"), { recursive: true });
  git(repo, "init", "--quiet", "--initial-branch=main");
  // Never touch any other repository: stop unless git resolves to the one just made.
  if (realpathSync(git(repo, "rev-parse", "--show-toplevel")) !== realpathSync(repo)) {
    throw new Error("git does not resolve to the temp repository; refusing to continue");
  }
  git(repo, "config", "user.name", "Hook Test");
  git(repo, "config", "user.email", "hook-test@example.invalid");
  copyFileSync(join(REPO, ".githooks", "pre-commit"), join(repo, ".githooks", "pre-commit"));
  chmodSync(join(repo, ".githooks", "pre-commit"), 0o755);
  execFileSync(process.execPath, [join(REPO, "tooling", "install-hooks.ts")], { cwd: repo, env: env(0) });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("AC5: a git pre-commit hook runs `pnpm check` in every worktree", () => {
  it("the installer points git at the committed hooks with a relative path", () => {
    expect(git(repo, "config", "core.hooksPath")).toBe(".githooks");
  });

  it("a commit runs `pnpm check` and lands when it passes", () => {
    expect(commit(repo, "first.txt", 0)).toEqual({ status: 0, gateArgs: "check", committed: true });
  });

  it("a failing check blocks the commit", () => {
    const result = commit(repo, "blocked.txt", 1);
    expect(result.status).not.toBe(0);
    expect(result.gateArgs).toBe("check");
    expect(result.committed).toBe(false);
  });

  it("a worktree runs the hook of its own checkout", () => {
    git(repo, "add", ".githooks/pre-commit");
    git(repo, "commit", "--quiet", "-m", "hooks");
    git(repo, "worktree", "add", "--quiet", "-b", "side", worktree);
    const blocked = commit(worktree, "side.txt", 1);
    expect(blocked.status).not.toBe(0);
    expect(blocked.gateArgs).toBe("check");
    expect(blocked.committed).toBe(false);
    expect(commit(worktree, "side.txt", 0)).toEqual({ status: 0, gateArgs: "check", committed: true });
  });

  it("outside a git checkout the installer does nothing and succeeds", () => {
    const plain = join(root, "not-a-repo");
    mkdirSync(plain);
    const result = spawnSync(process.execPath, [join(REPO, "tooling", "install-hooks.ts")], {
      cwd: plain,
      env: env(0),
    });
    expect(result.status).toBe(0);
    expect(existsSync(join(plain, ".git"))).toBe(false);
  });

  it("the root `prepare` script runs the installer, so `pnpm install` turns the hook on", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.prepare).toBe("node tooling/install-hooks.ts");
  });
});
