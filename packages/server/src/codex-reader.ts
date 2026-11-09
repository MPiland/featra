/**
 * The Codex reader (STORY-6): Codex's `.codex/agents/*.toml` as roles, and its `config.toml` files for the mode a chat
 * starts in (`approval_policy`, `sandbox_mode` and the project's trust entry). Read live, never written. Never reads
 * Codex's `auth.json` or anything else in its folder.
 */
import { join } from "node:path";
import { codexStartMode, parseCodexAgent } from "@featra/work-format";
import { chain, readAgentFolder, userChain, userFolder, type ProviderReader } from "./provider-reader.ts";
import type { RoleFs } from "./role-fs.ts";

const HOME_DIR = "CODEX_HOME";

const folder = (scope: "project" | "user", path: string, label: string) =>
  ({ provider: "codex", scope, path, ext: ".toml", parse: parseCodexAgent, label }) as const;

export function createCodexReader(fs: RoleFs): ProviderReader {
  return {
    id: "codex",
    async agents(dir) {
      const user = userFolder(fs, ".codex", HOME_DIR);
      const [project, mine] = await Promise.all([
        readAgentFolder(fs, folder("project", join(dir, ".codex", "agents"), ".codex/agents")),
        user ? readAgentFolder(fs, folder("user", join(user, "agents"), "~/.codex/agents")) : null,
      ]);
      return {
        roles: [...project.roles, ...(mine?.roles ?? [])],
        problems: [...project.problems, ...(mine?.problems ?? [])],
      };
    },
    async mode(dir) {
      const user = userFolder(fs, ".codex", HOME_DIR);
      const [userText, projectText] = await Promise.all([
        user ? fs.read(join(user, "config.toml")) : null,
        fs.read(join(dir, ".codex", "config.toml")),
      ]);
      return codexStartMode({ user: userText, project: projectText, dir });
    },
    watched: (dir) => [
      ...chain(dir, [".codex", "agents"], true),
      ...chain(dir, [".codex", "config.toml"]),
      ...userChain(fs, ".codex", HOME_DIR, ["agents"], true),
      ...userChain(fs, ".codex", HOME_DIR, ["config.toml"]),
    ],
  };
}
