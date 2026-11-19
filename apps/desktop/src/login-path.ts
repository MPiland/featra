import { execFile } from "node:child_process";
import { homedir, userInfo } from "node:os";
import { posix } from "node:path";

/**
 * The PATH of the user's login shell (STORY-64). Opened from Finder, the Dock or a Linux desktop menu, an app gets the
 * desktop's short PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), not the one the user's shell builds in `.zprofile` or
 * `.profile`, so `git`, `gh` and `claude` from Homebrew or `~/.local/bin` aren't found. The installed app asks the login
 * shell for its PATH at startup and puts it first; the PATH it was started with follows, so nothing is lost. Windows
 * apps get the user's PATH from the registry, so Windows is left alone.
 */

/** Runs the shell; resolves with what it printed, or null when it failed or didn't answer in time. */
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

export const runShell: RunShell = (shell, args, { timeoutMs, env }) =>
  new Promise((resolve) => {
    const child = execFile(shell, args, { encoding: "utf8", timeout: timeoutMs, env }, (err, stdout) =>
      resolve(err ? null : stdout),
    );
    child.stdin?.end();
  });

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
  return platform === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin", local] : ["/usr/local/bin", local];
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
  const output = await run(shell, ["-ilc", `printf '%s' "${MARK}\${PATH}${MARK}"`], { timeoutMs, env });
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
