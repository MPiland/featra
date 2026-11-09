/**
 * The Claude reader (STORY-6): Claude's `.claude/agents/*.md` as roles, and its `settings.json` files for the mode a
 * chat starts in. Read live, never written. Project and user level both count; for the mode the local project file
 * wins over the project's, and that over the user's.
 */
import { join } from "node:path";
import { claudeStartMode, parseClaudeAgent, type SettingsLayer } from "@featra/work-format";
import { chain, readAgentFolder, userChain, userFolder, type ProviderReader } from "./provider-reader.ts";
import type { RoleFs } from "./role-fs.ts";

const CONFIG_DIR = "CLAUDE_CONFIG_DIR";

const folder = (scope: "project" | "user", path: string, label: string) =>
  ({ provider: "claude", scope, path, ext: ".md", parse: parseClaudeAgent, label }) as const;

export function createClaudeReader(fs: RoleFs): ProviderReader {
  return {
    id: "claude",
    async agents(dir) {
      const user = userFolder(fs, ".claude", CONFIG_DIR);
      const [project, mine] = await Promise.all([
        readAgentFolder(fs, folder("project", join(dir, ".claude", "agents"), ".claude/agents")),
        user ? readAgentFolder(fs, folder("user", join(user, "agents"), "~/.claude/agents")) : null,
      ]);
      return {
        roles: [...project.roles, ...(mine?.roles ?? [])],
        problems: [...project.problems, ...(mine?.problems ?? [])],
      };
    },
    async mode(dir) {
      const user = userFolder(fs, ".claude", CONFIG_DIR);
      const files: { level: SettingsLayer["level"]; file: string; path: string | null }[] = [
        { level: "local", file: ".claude/settings.local.json", path: join(dir, ".claude", "settings.local.json") },
        { level: "project", file: ".claude/settings.json", path: join(dir, ".claude", "settings.json") },
        { level: "user", file: "~/.claude/settings.json", path: user ? join(user, "settings.json") : null },
      ];
      const layers = await Promise.all(
        files.map(async ({ level, file, path }) => ({ level, file, text: path ? await fs.read(path) : null })),
      );
      return claudeStartMode(layers);
    },
    watched: (dir) => [
      ...chain(dir, [".claude", "agents"], true),
      ...chain(dir, [".claude", "settings.json"]),
      ...chain(dir, [".claude", "settings.local.json"]),
      ...userChain(fs, ".claude", CONFIG_DIR, ["agents"], true),
      ...userChain(fs, ".claude", CONFIG_DIR, ["settings.json"]),
    ],
  };
}
