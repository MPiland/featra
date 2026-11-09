/**
 * A project folder and a home folder on the real disk, with the real role registry and provider readers over them:
 * only the folders are the test's own (the platform), everything that reads and writes roles is product code.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createClaudeReader } from "../src/claude-reader.ts";
import { createCodexReader } from "../src/codex-reader.ts";
import { nodeRoleFs } from "../src/role-fs.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { filesIn, tempFolder } from "./temp-folder.ts";

/** Writes a file under `root`, making its folders. */
const put = async (root: string, rel: string, text: string) => {
  const path = join(root, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
  return path;
};
/** Every file under `root` with its text: what a test compares to prove nothing was written. */
const contents = async (root: string) => {
  const out: Record<string, string> = {};
  for (const rel of await filesIn(root)) out[rel] = await readFile(join(root, rel), "utf8");
  return out;
};
export async function roleWorld(opts: { env?: NodeJS.ProcessEnv; home?: boolean } = {}) {
  const project = await tempFolder();
  const home = await tempFolder();
  // Claude's managed settings live in a folder of the test's own: the machine's real ones are never read.
  const managed = await tempFolder();
  const managedFile = join(managed.dir, "managed-settings.json");
  const fs = nodeRoleFs(opts.env ?? {}, opts.home === false ? null : home.dir, managedFile);
  const log: string[] = [];
  const registry = createRoleRegistry({
    fs,
    readers: [createClaudeReader(fs), createCodexReader(fs)],
    log: (m) => log.push(m),
  });
  return {
    dir: project.dir,
    home: home.dir,
    fs,
    managedFile,
    registry,
    log,
    put,
    contents,
    read: (path: string) => readFile(path, "utf8"),
    exists: async (root: string, rel: string) => (await filesIn(root)).includes(rel),
    names: (root: string) => readdir(root),
    dispose: async () => {
      await project.dispose();
      await home.dispose();
      await managed.dispose();
    },
  };
}

export const CLAUDE_AGENT =
  "---\nname: reviewer\ndescription: Reviews code\nmodel: opus\neffort: high\n---\nYou review.";
export const CODEX_AGENT =
  'name = "scout"\nmodel = "gpt-5"\nmodel_reasoning_effort = "low"\ndeveloper_instructions = "Look around."\n';
export const settings = (defaultMode: string) => JSON.stringify({ permissions: { defaultMode } });
