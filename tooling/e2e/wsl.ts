import { spawnSync } from "node:child_process";
import { win32 } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `pnpm test:e2e:wsl [playwright args]`: the Ubuntu e2e run, in WSL under Xvfb, from Windows. The app's windows go
 * to a private X display, never to WSLg, so nothing appears on the Windows desktop (decisions.md, 2026-11-07).
 * Run one suite at a time on the machine. `FEATRA_WSL_DISTRO` picks another distro (default Ubuntu).
 */

/**
 * The `wsl.exe` arguments that run `wsl-run.sh` for the checkout at `root`. `--cd` takes the Windows path itself;
 * after `--`, WSL's shell would strip its backslashes.
 */
export function wslArgs(distro: string, root: string, name: string, playwrightArgs: string[]): string[] {
  return ["-d", distro, "--cd", root, "--", "bash", "tooling/e2e/wsl-run.sh", name, ...playwrightArgs];
}

/** A folder name for the copy inside WSL: the checkout's own, so worktrees don't share one. */
export function copyName(windowsRoot: string): string {
  return win32.basename(windowsRoot).replace(/[^A-Za-z0-9._-]/g, "-");
}

function main(): number {
  const distro = process.env.FEATRA_WSL_DISTRO ?? "Ubuntu";
  const root = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
  const result = spawnSync("wsl.exe", wslArgs(distro, root, copyName(root), process.argv.slice(2)), {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
