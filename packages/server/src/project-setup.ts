import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  errorMessage,
  FEATRA_DIR,
  FEATRA_SCAFFOLD,
  isAgentInstructionFile,
  isRecord,
  type InitResult,
  type ProjectSetup,
} from "@featra/work-format";
import type { Git } from "./git.ts";

/**
 * Detecting and setting up a project: git, then Featra. Init only creates what is missing: every write is
 * exclusive (`wx`), so a file the user has is never replaced, even one that appears while init runs.
 */
const isDir = (path: string) =>
  stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );

const exists = (err: unknown) => isRecord(err) && err.code === "EEXIST";

export async function setupStatus(dir: string, git: Git): Promise<ProjectSetup> {
  try {
    if (!(await isDir(dir))) return { state: "error", error: `Folder not found: ${dir}` };
    if (!(await git.isRepo(dir))) return { state: "no-git" };
    return (await isDir(join(dir, FEATRA_DIR))) ? { state: "ready" } : { state: "no-featra" };
  } catch (err) {
    return { state: "error", error: errorMessage(err) };
  }
}

/** `git init`, unless the folder is already in a repository. Answers with the status after. */
export async function initGit(dir: string, git: Git): Promise<ProjectSetup> {
  const before = await setupStatus(dir, git);
  if (before.state !== "no-git") return before;
  try {
    await git.init(dir);
  } catch (err) {
    return { state: "error", error: errorMessage(err) };
  }
  return setupStatus(dir, git);
}

/** Writes `content` to a new file; false when the file is already there (it is left as it was). */
async function createFile(file: string, content: string): Promise<boolean> {
  await mkdir(dirname(file), { recursive: true });
  try {
    await writeFile(file, content, { encoding: "utf8", flag: "wx" });
    return true;
  } catch (err) {
    if (exists(err)) return false;
    throw err;
  }
}

/** Scaffolds Featra (see `FEATRA_SCAFFOLD`) in a git repository: what is missing is created, the rest kept. */
export async function initFeatra(dir: string, git: Git): Promise<InitResult> {
  const status = await setupStatus(dir, git);
  if (status.state === "error") return { ok: false, error: status.error };
  if (status.state === "no-git") return { ok: false, error: "Initialize git in this folder first." };
  const created: string[] = [];
  const kept: string[] = [];
  try {
    for (const entry of FEATRA_SCAFFOLD) {
      // A rule that guards the scaffold itself: agent instructions are the user's, whatever the list says.
      const paths = [entry.path, ...(entry.kind === "folder" ? entry.seed.map((s) => `${entry.path}/${s.name}`) : [])];
      const agentFile = paths.find(isAgentInstructionFile);
      if (agentFile) throw new Error(`Featra never writes ${agentFile}.`);
      const target = join(dir, ...entry.path.split("/"));
      if (entry.kind === "file") {
        ((await createFile(target, entry.content)) ? created : kept).push(entry.path);
        continue;
      }
      const label = `${entry.path}/`;
      if (await isDir(target)) {
        kept.push(label);
        continue;
      }
      await mkdir(target, { recursive: true });
      created.push(label);
      for (const seed of entry.seed) {
        if (await createFile(join(target, seed.name), seed.content)) created.push(`${entry.path}/${seed.name}`);
      }
    }
  } catch (err) {
    return { ok: false, error: `Can't initialize Featra: ${errorMessage(err)}` };
  }
  return { ok: true, created, kept };
}
