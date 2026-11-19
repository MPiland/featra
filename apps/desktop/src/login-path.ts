import { spawn, type ChildProcess } from "node:child_process";
import { homedir, userInfo } from "node:os";
import { posix } from "node:path";

/**
 * The PATH of the user's login shell (STORY-64). Opened from Finder, the Dock or a Linux desktop menu, an app gets the
 * desktop's short PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), not the one the user's shell builds in `.zprofile` or
 * `.profile`, so `git`, `gh` and `claude` from Homebrew or `~/.local/bin` aren't found. The installed app asks the login
 * shell for its PATH at startup and puts it first; the PATH it was started with follows, so nothing is lost. Windows
 * apps get the user's PATH from the registry, so Windows is left alone.
 */

/** Runs the shell; resolves with what it printed, or null when it couldn't start or didn't answer in time. */
export type RunShell = (
  shell: string,
  args: string[],
  options: { timeoutMs: number; env: NodeJS.ProcessEnv },
) => Promise<string | null>;

export interface LoginPathDeps {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  home?: string;
  /** The user's login shell from the OS's user record, used when SHELL isn't set. */
  accountShell?: string | null;
  run?: RunShell;
  timeoutMs?: number;
}

export type LoginPath =
  | { source: "login shell"; shell: string; path: string }
  | { source: "fallback"; shell: string; path: string; reason: string };

/** Long enough for a slow `.zshrc` (nvm, conda); a shell that waits on input never answers, and the fallback is used. */
export const LOGIN_SHELL_TIMEOUT_MS = 5000;

/** Marks the PATH in the shell's output, since an interactive shell's rc files may print their own lines. */
const MARK = "__FEATRA_PATH__";

/**
 * What the login shell runs: `/bin/sh` prints the PATH it inherits between the marks. The login shell itself only runs
 * one command with one single-quoted argument, which sh, bash, zsh, fish, tcsh and nushell all read alike; each has its
 * own syntax for a variable.
 */
export const PRINT_PATH = `/bin/sh -c 'printf "%s" "${MARK}\${PATH}${MARK}"'`;

/**
 * The login shell's arguments. csh and tcsh take `-l` only on its own, and read `.cshrc` or `.tcshrc` for every
 * command anyway; the others run it as an interactive login shell, which reads both the login and the rc files.
 */
export function shellArgs(shell: string): string[] {
  return /^t?csh$/.test(posix.basename(shell)) ? ["-c", PRINT_PATH] : ["-i", "-l", "-c", PRINT_PATH];
}

/**
 * Runs the shell in its own process group. Resolves as soon as the PATH is printed, so a background job the profile
 * started can't hold it up by keeping the output open, and with null at the time limit even if the shell ignores
 * SIGTERM, as an interactive one does. Either way the group is killed: the shell and whatever its profile started.
 */
export const runShell: RunShell = (shell, args, { timeoutMs, env }) =>
  new Promise((resolve) => {
    let output = "";
    let settled = false;
    const child = spawn(shell, args, {
      env,
      stdio: ["ignore", "pipe", "ignore"],
      detached: process.platform !== "win32",
    });
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout?.destroy();
      killGroup(child);
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      output += chunk;
      if (parseShellPath(output) !== null) finish(output);
    });
    child.on("error", () => finish(null));
    child.on("close", () => finish(output));
  });

function killGroup(child: ChildProcess) {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

/** The shell to ask: SHELL, else the account's login shell, else the platform's default. */
export function loginShell(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, accountShell?: string | null): string {
  return env.SHELL || accountShell || (platform === "darwin" ? "/bin/zsh" : "/bin/sh");
}

/** The PATH between the marks in the shell's output, or null when it printed none. */
export function parseShellPath(output: string | null): string | null {
  if (output === null) return null;
  const start = output.indexOf(MARK);
  const end = output.indexOf(MARK, start + MARK.length);
  if (start < 0 || end < 0) return null;
  const path = output.slice(start + MARK.length, end).trim();
  return path === "" ? null : path;
}

/** `first`'s folders, then `rest`'s that aren't in it, without empties. */
export function mergePaths(first: readonly string[], rest: readonly string[]): string {
  return [...new Set([...first, ...rest].filter(Boolean))].join(":");
}

/** Where `git`, `gh` and `claude` are usually installed, for when the shell doesn't answer. */
export function usualFolders(platform: NodeJS.Platform, home: string): string[] {
  const local = posix.join(home, ".local", "bin"); // claude's own installer
  if (platform === "darwin") return ["/opt/homebrew/bin", "/usr/local/bin", local];
  // Homebrew on Linux, npm's global folder as its docs suggest setting it, and snaps.
  return [
    "/usr/local/bin",
    local,
    "/home/linuxbrew/.linuxbrew/bin",
    posix.join(home, ".npm-global", "bin"),
    "/snap/bin",
  ];
}

/**
 * The PATH the app should run with on macOS and Linux: the login shell's, then the one it was started with. When the
 * shell fails, prints no PATH or doesn't answer in time, the PATH it was started with, then the usual folders.
 */
export async function readLoginPath({
  platform,
  env,
  home = homedir(),
  accountShell = safeAccountShell(),
  run = runShell,
  timeoutMs = LOGIN_SHELL_TIMEOUT_MS,
}: LoginPathDeps): Promise<LoginPath> {
  const shell = loginShell(platform, env, accountShell);
  const started = (env.PATH ?? "").split(":");
  const output = await run(shell, shellArgs(shell), { timeoutMs, env });
  const path = parseShellPath(output);
  if (path !== null) return { source: "login shell", shell, path: mergePaths(path.split(":"), started) };
  const reason = output === null ? "it failed or didn't answer in time" : "it printed no PATH";
  return { source: "fallback", shell, path: mergePaths(started, usualFolders(platform, home)), reason };
}

/** Whether the app reads the login shell's PATH: installed, on macOS and Linux. Run from source, a terminal started it. */
export const readsLoginPath = (platform: NodeJS.Platform, packaged: boolean) => packaged && platform !== "win32";

function safeAccountShell(): string | null {
  try {
    return userInfo().shell;
  } catch {
    return null;
  }
}
