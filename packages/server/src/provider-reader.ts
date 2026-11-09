/**
 * The provider reader seam (STORY-6, ADR 0018): one reader per provider that has an agent format, each reading that
 * provider's agent definitions as roles and its own settings for the mode a chat starts in. Both are read live from
 * the provider's files on every call, and never written. A provider that documents no agent format gets none.
 */
import { join } from "node:path";
import type { AgentRead, ModeRead, Role, SettingsProvider } from "@featra/work-format";
import type { RoleFs } from "./role-fs.ts";

/** What a reader found: the roles from its agent files, and what it couldn't read. */
export interface AgentsRead {
  roles: Role[];
  problems: string[];
}

/** A file or folder whose change can change what a reader reads, for the live watch. */
export interface WatchTarget {
  path: string;
  /** Only events for these names count; every event does when absent. */
  names?: readonly string[];
}

export interface ProviderReader {
  id: SettingsProvider;
  /** The provider's agent definitions, in the project and in the user's own folder. */
  agents: (dir: string) => Promise<AgentsRead>;
  /** The mode its settings say a chat starts in: user and project level, local too. */
  mode: (dir: string) => Promise<ModeRead>;
  /** What to watch, so a change to any file the two read shows without a restart. */
  watched: (dir: string) => WatchTarget[];
}

/** One agent definition folder: where it is, its extension, the parser, and the role's scope. */
export interface AgentFolder {
  provider: SettingsProvider;
  scope: "project" | "user";
  path: string;
  ext: string;
  parse: (content: string, stem: string) => AgentRead;
  /** How a problem names the folder ("~/.claude/agents", ".claude/agents"). */
  label: string;
}

/** Every agent file in the folder as a role named for its file; a file that can't be read is a problem, never fatal. */
export async function readAgentFolder(fs: RoleFs, folder: AgentFolder): Promise<AgentsRead> {
  const roles: Role[] = [];
  const problems: string[] = [];
  let names: string[];
  try {
    names = (await fs.list(folder.path)).filter((n) => n.endsWith(folder.ext)).toSorted();
  } catch (e) {
    return { roles, problems: [`Can't read ${folder.label}: ${e instanceof Error ? e.message : String(e)}`] };
  }
  for (const name of names) {
    const stem = name.slice(0, -folder.ext.length);
    const where = `${folder.label}/${name}`;
    try {
      const content = await fs.read(join(folder.path, name));
      if (content === null) continue;
      const read = folder.parse(content, stem);
      if (!read.ok) {
        problems.push(`Can't read ${where}: ${read.error}`);
        continue;
      }
      const { agent } = read;
      roles.push({
        id: `${folder.provider}:${folder.scope}:${stem}`,
        name: agent.name,
        provider: "claude",
        prompt: agent.prompt,
        // Kept as the file says it: the registry fits it to the agent that runs the chat.
        model: agent.model ?? "",
        effort: agent.effort,
        permission: "ask",
        source: { kind: "provider", provider: folder.provider, scope: folder.scope },
        ...(agent.description ? { description: agent.description } : {}),
      });
    } catch (e) {
      problems.push(`Can't read ${where}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { roles, problems };
}

/**
 * The watch targets that see `parts` appear and change under `base`: each folder down to the last, watching for the
 * next name (so a folder made later is seen), and the last name itself when it is a folder to watch whole.
 */
export function chain(base: string, parts: readonly string[], folder = false): WatchTarget[] {
  const targets: WatchTarget[] = [];
  let path = base;
  for (const part of parts) {
    targets.push({ path, names: [part] });
    path = join(path, part);
  }
  if (folder) targets.push({ path });
  return targets;
}

/** A provider's own folder under the user's home (`~/.claude`), or where its environment variable puts it; null without a home. */
export function userFolder(fs: RoleFs, name: string, envVar: string): string | null {
  const set = fs.env[envVar];
  if (set) return set;
  return fs.home ? join(fs.home, name) : null;
}

/** `chain` for the user's folder: from home down, unless the environment variable moved the folder. */
export function userChain(fs: RoleFs, name: string, envVar: string, parts: readonly string[], folder = false) {
  const set = fs.env[envVar];
  if (set) return chain(set, parts, folder);
  return fs.home ? chain(fs.home, [name, ...parts], folder) : [];
}
