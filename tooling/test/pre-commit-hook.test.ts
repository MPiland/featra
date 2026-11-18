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
const gatePath = join(root, "pnpm-path.txt");
const workersPath = join(root, "pnpm-workers.txt");
const guardPath = join(root, "pnpm-guard.txt");

/**
 * The environment without git's own variables. Run from the pre-commit hook, the gate inherits GIT_DIR, GIT_INDEX_FILE
 * and the like, which would point every git call here at the repository being committed instead of the temp one.
 */
const outsideGit = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => !name.startsWith("GIT_") && name !== "VITEST_MAX_WORKERS" && name !== "FEATRA_HANG_GUARD_MS",
  ),
);
/** Windows spells it `Path`; setting a second `PATH` beside it leaves which one wins to chance. */
const pathKey = Object.keys(outsideGit).find((name) => name.toUpperCase() === "PATH") ?? "PATH";

function env(pnpmExit: number, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...outsideGit,
    ...extra,
    [pathKey]: `${bin}${delimiter}${outsideGit[pathKey] ?? ""}`,
    FAKE_PNPM_EXIT: String(pnpmExit),
    FAKE_PNPM_CALLS: calls,
    FAKE_PNPM_PATH: gatePath,
    FAKE_PNPM_WORKERS: workersPath,
    FAKE_PNPM_GUARD: guardPath,
    GIT_CEILING_DIRECTORIES: root,
  };
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env: env(0), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function commit(cwd: string, file: string, pnpmExit: number, extra: NodeJS.ProcessEnv = {}) {
  writeFileSync(join(cwd, file), `${file}\n`);
  git(cwd, "add", file);
  return commitStaged(cwd, `add ${file}`, pnpmExit, extra);
}

/** Commits what is staged, through the hook. */
function commitStaged(cwd: string, message: string, pnpmExit: number, extra: NodeJS.ProcessEnv = {}) {
  rmSync(calls, { force: true });
  const result = spawnSync("git", ["commit", "-m", message], { cwd, env: env(pnpmExit, extra), encoding: "utf8" });
  return {
    status: result.status,
    gateArgs: existsSync(calls) ? readFileSync(calls, "utf8").trim() : null,
    committed: git(cwd, "log", "--format=%s").split("\n").includes(message),
  };
}

beforeAll(() => {
  mkdirSync(bin);
  // Git runs hooks with its own sh (Git Bash on Windows), so a sh script named `pnpm` is found first on PATH.
  writeFileSync(
    join(bin, "pnpm"),
    '#!/bin/sh\necho "$@" >> "$FAKE_PNPM_CALLS"\nprintf %s "$PATH" > "$FAKE_PNPM_PATH"\nprintf %s "$VITEST_MAX_WORKERS" > "$FAKE_PNPM_WORKERS"\nprintf %s "$FEATRA_HANG_GUARD_MS" > "$FAKE_PNPM_GUARD"\nexit "$FAKE_PNPM_EXIT"\n',
  );
  chmodSync(join(bin, "pnpm"), 0o755);
  mkdirSync(join(repo, ".githooks"), { recursive: true });
  git(repo, "init", "--quiet", "--initial-branch=main");
  // Never touch any other repository: stop unless git resolves to the one just made. `native` expands Windows 8.3
  // names such as RUNNER~1 in the temp path, which git reports in full (BUG-5).
  if (realpathSync.native(git(repo, "rev-parse", "--show-toplevel")) !== realpathSync.native(repo)) {
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

  it("the gate runs without git's exec-path on PATH, so its tests start the git a shell would (BUG-6)", () => {
    commit(repo, "path.txt", 0);
    // The hook's own sh spells folders its way (`/mingw64/...` in Git Bash); ask it for the exec-path in that form.
    const execPath = execFileSync("sh", ["-c", 'cd "$(git --exec-path)" && pwd'], { env: env(0), encoding: "utf8" });
    const entries = readFileSync(gatePath, "utf8").split(":");
    expect(entries).not.toContain(execPath.trim());
    expect(entries).toContain(execFileSync("sh", ["-c", 'cd "$1" && pwd', "sh", bin], { encoding: "utf8" }).trim());
  });

  it("the gate runs the unit tests with 3 workers unless the environment says otherwise (BUG-12)", () => {
    commit(repo, "workers.txt", 0);
    expect(readFileSync(workersPath, "utf8")).toBe("3");
    commit(repo, "workers-more.txt", 0, { VITEST_MAX_WORKERS: "6" });
    expect(readFileSync(workersPath, "utf8")).toBe("6");
  });

  it("a commit of only cards and Markdown runs the content gate, which still blocks on failure (BUG-28)", () => {
    mkdirSync(join(repo, ".featra", "cards"), { recursive: true });
    expect(commit(repo, ".featra/cards/BUG-1-card.md", 0)).toEqual({
      status: 0,
      gateArgs: "check:content",
      committed: true,
    });
    expect(commit(repo, "notes.md", 0)).toEqual({ status: 0, gateArgs: "check:content", committed: true });
    const blocked = commit(repo, ".featra/cards/BUG-2-card.md", 1);
    expect(blocked.status).not.toBe(0);
    expect(blocked.gateArgs).toBe("check:content");
    expect(blocked.committed).toBe(false);
    git(repo, "reset", "--quiet");
    rmSync(join(repo, ".featra", "cards", "BUG-2-card.md"));
  });

  it("a card commit runs the whole gate when code changed too: staged, unstaged or untracked (BUG-28)", () => {
    writeFileSync(join(repo, "code.ts"), "export {};\n");
    git(repo, "add", "code.ts");
    expect(commit(repo, ".featra/cards/BUG-3-card.md", 0).gateArgs).toBe("check");
    writeFileSync(join(repo, "code.ts"), "export const a = 1;\n");
    expect(commit(repo, ".featra/cards/BUG-4-card.md", 0).gateArgs).toBe("check");
    git(repo, "checkout", "--", "code.ts");
    writeFileSync(join(repo, "untracked.ts"), "export {};\n");
    expect(commit(repo, ".featra/cards/BUG-5-card.md", 0).gateArgs).toBe("check");
    rmSync(join(repo, "untracked.ts"));
  });

  it("Markdown in a package is code's to test: committing it runs the whole gate (BUG-28)", () => {
    mkdirSync(join(repo, "packages", "server"), { recursive: true });
    expect(commit(repo, "packages/server/prompt.md", 0).gateArgs).toBe("check");
    mkdirSync(join(repo, "docs", "adr"), { recursive: true });
    expect(commit(repo, "docs/adr/0001-note.md", 0).gateArgs).toBe("check:content");
  });

  it("the gate gets a 900 s hang guard unless the environment says otherwise (BUG-28)", () => {
    commit(repo, "guard.txt", 0);
    expect(readFileSync(guardPath, "utf8")).toBe("900000");
    commit(repo, "guard-less.txt", 0, { FEATRA_HANG_GUARD_MS: "60000" });
    expect(readFileSync(guardPath, "utf8")).toBe("60000");
  });

  it("code renamed into `.featra/` is still code: the whole gate runs (BUG-28)", () => {
    writeFileSync(join(repo, "moved.ts"), "export const moved = 1;\n");
    git(repo, "add", "moved.ts");
    git(repo, "commit", "--quiet", "-m", "moved code");
    git(repo, "mv", "moved.ts", ".featra/cards/BUG-7-moved.md");
    expect(commitStaged(repo, "rename code to a card", 0).gateArgs).toBe("check");
  });

  it("deleting code runs the whole gate (BUG-28)", () => {
    writeFileSync(join(repo, "gone.ts"), "export const gone = 1;\n");
    git(repo, "add", "gone.ts");
    git(repo, "commit", "--quiet", "-m", "gone code");
    git(repo, "rm", "--quiet", "gone.ts");
    expect(commit(repo, ".featra/cards/BUG-8-card.md", 0).gateArgs).toBe("check");
  });

  it("reads a path with a space or an accent whole (BUG-28)", () => {
    expect(commit(repo, ".featra/cards/BUG-9 a card.md", 0).gateArgs).toBe("check:content");
    expect(commit(repo, "docs/café.md", 0).gateArgs).toBe("check:content");
    mkdirSync(join(repo, "src dir"));
    expect(commit(repo, "src dir/a b.ts", 0).gateArgs).toBe("check");
  });

  it("counts an untracked file only if a test or build could load it (BUG-28)", () => {
    writeFileSync(join(repo, "mockup.png"), "png");
    expect(commit(repo, ".featra/cards/BUG-10-card.md", 0).gateArgs).toBe("check:content");
    for (const [file, n] of [
      ["data.json", 11],
      ["styles.css", 12],
      ["packages/server/notes.txt", 13],
      ["tooling/shot.png", 14],
    ] as const) {
      mkdirSync(join(repo, file, ".."), { recursive: true });
      writeFileSync(join(repo, file), "x");
      expect(commit(repo, `.featra/cards/BUG-${n}-card.md`, 0).gateArgs, file).toBe("check");
      rmSync(join(repo, file));
    }
    rmSync(join(repo, "mockup.png"));
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
