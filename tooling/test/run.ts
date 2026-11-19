import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The repository root. */
export const REPO = join(import.meta.dirname, "..", "..");

/** A GitHub Actions workflow under `.github/workflows`, with LF line endings. */
export function workflow(file: string): string {
  return readFileSync(join(REPO, ".github", "workflows", file), "utf8").replaceAll("\r\n", "\n");
}

/** One job's lines in a workflow: from its `  <job>:` key to the next job. Empty when there is no such job. */
export function workflowJob(file: string, job: string): string {
  return (
    workflow(file)
      .split(new RegExp(String.raw`^  ${job}:$`, "m"))[1]
      ?.split(/^ {2}\S/m)[0] ?? ""
  );
}

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
