/**
 * The Claude reader (STORY-6): Claude's `.claude/agents/*.md` as roles, and its `settings.json` files for the mode a
 * chat starts in. Read live, never written. Project and user level both count; for the mode the managed file wins,
 * then the local project file, the project's and the user's.
 */
import { basename, dirname, join } from "node:path";
import { claudeStartMode, parseClaudeAgent, type SettingsLayer } from "@featra/work-format";
import { chain, readAgents, userChain, userFolder, type ProviderReader } from "./provider-reader.ts";
import type { RoleFs } from "./role-fs.ts";

const CONFIG_DIR = "CLAUDE_CONFIG_DIR";
const PROVIDER = {
  id: "claude",
  dotFolder: ".claude",
  envVar: CONFIG_DIR,
  ext: ".md",
  parse: parseClaudeAgent,
} as const;

export function createClaudeReader(fs: RoleFs): ProviderReader {
  const managed = fs.managedSettings;
  return {
    id: "claude",
    agents: (dir) => readAgents(fs, dir, PROVIDER),
    async mode(dir) {
      const user = userFolder(fs, ".claude", CONFIG_DIR);
      // Highest precedence first: the machine's managed settings, then local, project and user.
      const files: { level: SettingsLayer["level"]; file: string; path: string | null }[] = [
        { level: "managed", file: "Claude's managed settings", path: managed },
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
      ...(managed ? [{ path: dirname(managed), names: [basename(managed)] }] : []),
    ],
  };
}
