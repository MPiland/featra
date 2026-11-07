import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

/** The environment without git's hook variables (the pre-commit hook sets GIT_INDEX_FILE and friends). */
export function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return env;
}

/** A temporary folder, optionally a real git repository (`git init`, run here directly, not through the server). */
export async function tempFolder(opts: { git?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "featra-server-"));
  if (opts.git) execFileSync("git", ["init", "-q"], { cwd: dir, env: cleanGitEnv() });
  return { dir, dispose: () => rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }) };
}

/** Every file under `dir`, relative and "/"-separated, leaving out `.git/`. */
export async function filesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join("/"))
    .filter((p) => !p.startsWith(".git/"))
    .toSorted();
}
