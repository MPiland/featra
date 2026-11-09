/**
 * The Codex reader (STORY-6): Codex's `.codex/agents/*.toml` as roles, and its `config.toml` files for the mode a chat
 * starts in (`approval_policy`, `sandbox_mode` and the project's trust entry). Read live, never written. Never reads
 * Codex's `auth.json` or anything else in its folder.
 */
import { join } from "node:path";
import { codexStartMode, parseCodexAgent, withAncestors } from "@featra/work-format";
import { chain, readAgents, userChain, userFolder, type ProviderReader } from "./provider-reader.ts";
import type { RoleFs } from "./role-fs.ts";

const HOME_DIR = "CODEX_HOME";
const PROVIDER = { id: "codex", dotFolder: ".codex", envVar: HOME_DIR, ext: ".toml", parse: parseCodexAgent } as const;

const WORKTREE = /[\\/]\.git[\\/]worktrees[\\/].*$/;

/** The main checkouts of the git worktrees `dir` sits in: where a trust entry may name a worktree's project. */
async function mainCheckouts(fs: RoleFs, dir: string): Promise<string[]> {
  const roots: string[] = [];
  for (const folder of withAncestors(dir)) {
    const text = await fs.read(join(folder, ".git")).catch(() => null);
    const gitdir = /^gitdir:\s*(.+?)\s*$/m.exec(text ?? "")?.[1];
    if (gitdir && WORKTREE.test(gitdir)) roots.push(gitdir.replace(WORKTREE, ""));
  }
  return roots;
}

export function createCodexReader(fs: RoleFs): ProviderReader {
  return {
    id: "codex",
    agents: (dir) => readAgents(fs, dir, PROVIDER),
    async mode(dir) {
      const user = userFolder(fs, ".codex", HOME_DIR);
      const [userText, projectText, roots] = await Promise.all([
        user ? fs.read(join(user, "config.toml")) : null,
        fs.read(join(dir, ".codex", "config.toml")),
        mainCheckouts(fs, dir),
      ]);
      return codexStartMode({ user: userText, project: projectText, dir, roots });
    },
    watched: (dir) => [
      ...chain(dir, [".codex", "agents"], true),
      ...chain(dir, [".codex", "config.toml"]),
      ...userChain(fs, ".codex", HOME_DIR, ["agents"], true),
      ...userChain(fs, ".codex", HOME_DIR, ["config.toml"]),
    ],
  };
}
