import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loginShell,
  mergePaths,
  parseShellPath,
  readLoginPath,
  readsLoginPath,
  runShell,
  usualFolders,
  type RunShell,
} from "../src/login-path.ts";

/**
 * STORY-64: installed on macOS and Linux, the app takes the login shell's PATH, with a fallback when the shell doesn't
 * answer. The shell is faked here only where the case is the shell's own failure; a real `sh` reads a real profile below.
 */
const STARTED = "/usr/bin:/bin:/usr/sbin:/sbin";
const answering =
  (output: string | null): RunShell =>
  async () =>
    output;

/** What the shell did, run again, for a failure message. */
function shellReport(reason: string, asked: Parameters<RunShell> | undefined): string {
  if (!asked) return reason;
  const [shell, args, { timeoutMs, env }] = asked;
  const ran = spawnSync(shell, args, { env, timeout: timeoutMs, encoding: "utf8", input: "" });
  return `${reason}; again: status ${ran.status}, signal ${ran.signal}, error ${ran.error?.message}, stdout ${JSON.stringify(ran.stdout)}, stderr ${JSON.stringify(ran.stderr)}`;
}

describe("the login shell's PATH (STORY-64)", () => {
  it("is read only by the installed app, and not on Windows", () => {
    expect(readsLoginPath("darwin", true)).toBe(true);
    expect(readsLoginPath("linux", true)).toBe(true);
    expect(readsLoginPath("win32", true)).toBe(false);
    expect(readsLoginPath("darwin", false)).toBe(false);
    expect(readsLoginPath("linux", false)).toBe(false);
  });

  it("asks SHELL, then the account's login shell, then the platform's default", () => {
    expect(loginShell("darwin", { SHELL: "/opt/homebrew/bin/fish" }, "/bin/zsh")).toBe("/opt/homebrew/bin/fish");
    expect(loginShell("linux", {}, "/usr/bin/bash")).toBe("/usr/bin/bash");
    expect(loginShell("darwin", {}, null)).toBe("/bin/zsh");
    expect(loginShell("linux", {}, null)).toBe("/bin/sh");
  });

  it("runs the shell as an interactive login shell and puts its PATH first, keeping the rest of the started one", async () => {
    let asked: { shell: string; args: string[] } | undefined;
    const found = await readLoginPath({
      platform: "darwin",
      env: { PATH: `${STARTED}:/Applications/Tool.app/bin`, SHELL: "/bin/zsh" },
      run: async (shell, args) => {
        asked = { shell, args };
        return "__FEATRA_PATH__/opt/homebrew/bin:/usr/bin:/bin__FEATRA_PATH__";
      },
    });
    expect(asked).toEqual({ shell: "/bin/zsh", args: ["-ilc", `printf '%s' "__FEATRA_PATH__$PATH__FEATRA_PATH__"`] });
    expect(found).toEqual({
      source: "login shell",
      shell: "/bin/zsh",
      path: "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/Tool.app/bin",
    });
  });

  it("reads the PATH between its marks when the shell's rc files print lines of their own", () => {
    const noisy = "Welcome back!\nnvm: using node 24\n__FEATRA_PATH__/home/me/.local/bin:/usr/bin__FEATRA_PATH__\nbye";
    expect(parseShellPath(noisy)).toBe("/home/me/.local/bin:/usr/bin");
  });

  it("falls back to the started PATH and the usual folders when the shell fails or doesn't answer in time", async () => {
    const found = await readLoginPath({
      platform: "darwin",
      env: { PATH: STARTED, SHELL: "/bin/zsh" },
      home: "/Users/me",
      run: answering(null),
    });
    expect(found).toEqual({
      source: "fallback",
      shell: "/bin/zsh",
      reason: "it failed or didn't answer in time",
      path: `${STARTED}:/opt/homebrew/bin:/usr/local/bin:/Users/me/.local/bin`,
    });
  });

  it("falls back when the shell answers without a PATH", async () => {
    const found = await readLoginPath({
      platform: "linux",
      env: { PATH: "/usr/local/bin:/usr/bin", SHELL: "/bin/bash" },
      home: "/home/me",
      run: answering("bash: no job control in this shell\n"),
    });
    expect(found).toEqual({
      source: "fallback",
      shell: "/bin/bash",
      reason: "it printed no PATH",
      path: "/usr/local/bin:/usr/bin:/home/me/.local/bin",
    });
    expect(parseShellPath("__FEATRA_PATH____FEATRA_PATH__")).toBeNull();
  });

  it("names the usual folders per platform, claude's own installer folder in both", () => {
    expect(usualFolders("darwin", "/Users/me")).toEqual([
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/Users/me/.local/bin",
    ]);
    expect(usualFolders("linux", "/home/me")).toEqual(["/usr/local/bin", "/home/me/.local/bin"]);
  });

  it("lists each folder once and drops empty ones", () => {
    expect(mergePaths(["/a", "", "/b"], ["/b", "/c", "/a"])).toBe("/a:/b:/c");
  });

  it("falls back when a real shell never answers, after the time limit", async () => {
    const found = await readLoginPath({
      platform: "linux",
      env: { PATH: STARTED },
      home: "/home/me",
      run: (_shell, _args, options) => runShell(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], options),
      timeoutMs: 300,
    });
    expect(found.source).toBe("fallback");
    expect(found.path).toBe(`${STARTED}:/usr/local/bin:/home/me/.local/bin`);
  });

  it.skipIf(!existsSync("/bin/sh"))("reads the PATH a real login shell's profile sets", async () => {
    const home = await mkdtemp(join(tmpdir(), "featra-login-home-"));
    try {
      await writeFile(join(home, ".profile"), 'PATH="$HOME/tools/bin:$PATH"\nexport PATH\necho "profile says hi"\n');
      await chmod(join(home, ".profile"), 0o644);
      let asked: Parameters<RunShell> | undefined;
      const found = await readLoginPath({
        platform: "linux",
        env: { PATH: STARTED, SHELL: "/bin/sh", HOME: home, ENV: "" },
        run: (...call) => ((asked = call), runShell(...call)),
      });
      expect(found.source, found.source === "fallback" ? shellReport(found.reason, asked) : "").toBe("login shell");
      expect(found.path.split(":")[0]).toBe(join(home, "tools", "bin"));
      expect(found.path.split(":")).toEqual(expect.arrayContaining(STARTED.split(":")));
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
