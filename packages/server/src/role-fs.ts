/**
 * The disk the role registry reads and writes (STORY-6): a small interface the registry takes, so tests give it their
 * own folders and home. Reads answer null for a file that isn't there; only `.featra/roles/` is ever written.
 */
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";

export interface RoleFs {
  /** The user's home folder, or null when there is none: the providers' user-level files are then skipped. */
  home: string | null;
  /** The environment, for the providers' own folder overrides (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`). */
  env: NodeJS.ProcessEnv;
  /** Claude's machine-wide managed settings file, which outranks every other settings layer; null when none applies. */
  managedSettings: string | null;
  /** A file's text, or null when it isn't there. Anything else that goes wrong throws. */
  read: (path: string) => Promise<string | null>;
  /** The names in a folder, or none when it isn't there. */
  list: (path: string) => Promise<string[]>;
  /** Writes a file whole (never half-written to a watcher), making its folder. */
  write: (path: string, text: string) => Promise<void>;
  /** Deletes a file; nothing when it isn't there. */
  remove: (path: string) => Promise<void>;
}

const missing = (e: unknown) => e instanceof Error && "code" in e && (e.code === "ENOENT" || e.code === "ENOTDIR");

/** The home folder, or null when the platform has none. */
function userHome(): string | null {
  try {
    return homedir() || null;
  } catch {
    return null;
  }
}

const MANAGED_SETTINGS: Partial<Record<NodeJS.Platform, string>> = {
  win32: String.raw`C:\Program Files\ClaudeCode\managed-settings.json`,
  darwin: "/Library/Application Support/ClaudeCode/managed-settings.json",
  linux: "/etc/claude-code/managed-settings.json",
};

/** Where Claude keeps its managed settings on this platform. */
export const claudeManagedPath = (platform: NodeJS.Platform = process.platform): string | null =>
  MANAGED_SETTINGS[platform] ?? null;

export function nodeRoleFs(
  env: NodeJS.ProcessEnv = process.env,
  home: string | null = userHome(),
  managedSettings: string | null = claudeManagedPath(),
): RoleFs {
  return {
    home,
    env,
    managedSettings,
    read: (path) =>
      readFile(path, "utf8").catch((e: unknown) => {
        if (missing(e)) return null;
        throw e;
      }),
    list: (path) =>
      readdir(path).catch((e: unknown) => {
        if (missing(e)) return [];
        throw e;
      }),
    async write(path, text) {
      await mkdir(dirname(path), { recursive: true });
      const temp = `${path}.${process.pid}.tmp`;
      await writeFile(temp, text, "utf8");
      await rename(temp, path);
    },
    remove: (path) => rm(path, { force: true }),
  };
}
