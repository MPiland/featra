import { spawnSync } from "node:child_process";
import { join } from "node:path";

/** The repository root. */
export const REPO = join(import.meta.dirname, "..", "..");

export interface RunResult {
  status: number | null;
  stdout: string;
  output: string;
}

/**
 * Runs a command line through the shell (pnpm is a `.cmd` shim on Windows), from the repo root unless `cwd` says
 * otherwise. Arguments are trusted test constants and paths without spaces.
 */
export function run(command: string, options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): RunResult {
  const result = spawnSync(command, {
    cwd: options.cwd ?? REPO,
    env: options.env ?? process.env,
    encoding: "utf8",
    shell: true,
    timeout: 120_000,
  });
  return { status: result.status, stdout: result.stdout, output: `${result.stdout}${result.stderr}` };
}
