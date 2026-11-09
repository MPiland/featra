/**
 * Reads the starting permission mode out of the providers' own settings (STORY-6): pure, so the server's readers only
 * fetch the files. Claude: `permissions.defaultMode` in the user, project and local `settings.json`, the most specific
 * file winning. Codex: `approval_policy` and `sandbox_mode` in `config.toml` (the user's, then the project's own when
 * the project is trusted), plus the `[projects."<path>"] trust_level` entry.
 */
import { parse as parseToml } from "smol-toml";
import {
  BYPASS_DISABLED_NOTE,
  claudeModeInfo,
  CODEX_APPROVALS,
  CODEX_SANDBOXES,
  type ModeInfo,
  type SettingsLevel,
} from "./modes.ts";
import { errorMessage, isOneOf, isRecord } from "./utils/guards.ts";

/** What a reader found: the mode (null when no setting names one) and what it couldn't read. */
export interface ModeRead {
  mode: ModeInfo | null;
  problems: string[];
  /** One line on why the role starts on Ask although a setting says otherwise; shown on the role and its chat. */
  note?: string;
  /** Claude's settings switch full access off: a role's own bypass mode is no longer honoured either. */
  bypassOff?: boolean;
}

/** A settings file's text (null when the file isn't there) and where it sits. */
export interface SettingsLayer {
  level: SettingsLevel;
  /** How a problem names the file. */
  file: string;
  text: string | null;
}

/** Whether a settings object switches full access off: `permissions.disableBypassPermissionsMode: "disable"`. */
function bypassDisabled(settings: unknown): boolean {
  if (!isRecord(settings)) return false;
  const permissions = isRecord(settings.permissions) ? settings.permissions : {};
  return (permissions.disableBypassPermissionsMode ?? settings.disableBypassPermissionsMode) === "disable";
}

/**
 * Claude's starting mode: the first layer, highest precedence first (managed, local, project, user), that names a
 * `permissions.defaultMode`. A mode Featra doesn't know stops the search on Ask with a note, so a typo in a higher
 * layer never lets a lower layer's bypass through. A layer that switches full access off (in any layer) turns a
 * bypass mode into Ask, with a note.
 */
export function claudeStartMode(layers: readonly SettingsLayer[]): ModeRead {
  const problems: string[] = [];
  const read: { layer: SettingsLayer; settings: unknown }[] = [];
  for (const layer of layers) {
    if (layer.text === null) continue;
    try {
      read.push({ layer, settings: JSON.parse(layer.text) });
    } catch (e) {
      problems.push(`Can't read ${layer.file}: ${errorMessage(e)}`);
    }
  }
  const off = read.some(({ settings }) => bypassDisabled(settings)) ? { bypassOff: true } : {};
  const bypassOff = "bypassOff" in off;
  for (const { layer, settings } of read) {
    const permissions = isRecord(settings) ? settings.permissions : undefined;
    const set = isRecord(permissions) ? permissions.defaultMode : undefined;
    if (set === undefined) continue;
    const mode = claudeModeInfo(set, layer.level);
    if (!mode) {
      const problem = `${layer.file} sets a permission mode Featra doesn't know.`;
      return { mode: null, problems: [...problems, problem], note: `${problem} Starting on Ask.`, ...off };
    }
    if (mode.fullAccess && bypassOff) return { mode: null, problems, note: BYPASS_DISABLED_NOTE, ...off };
    return { mode, problems, ...off };
  }
  return { mode: null, problems, ...off };
}

/** A path as Codex's trust table spells it, made comparable: no `\\?\` prefix, "/" separators, drive letters folded. */
export function samePath(a: string, b: string): boolean {
  return comparable(a) === comparable(b);
}

function comparable(p: string): string {
  const s = p
    .replace(/^\\\\\?\\UNC\\/i, "\\\\")
    .replace(/^\\\\\?\\/, "")
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");
  // Windows paths ignore case: drive paths and UNC shares alike.
  return /^[a-z]:/i.test(s) || s.startsWith("//") ? s.toLowerCase() : s;
}

/** `dir` and every folder above it, nearest first: where a trust entry may name a project that sits inside them. */
export function withAncestors(dir: string): string[] {
  const out: string[] = [];
  let path = dir.replace(/[\\/]+$/, "");
  while (path) {
    out.push(path);
    const next = path.replace(/[\\/][^\\/]*$/, "");
    if (next === path || next === "") break;
    path = next;
  }
  return out;
}

type Table = Record<string, unknown>;

function parseTable(text: string | null, file: string, problems: string[]): Table | null {
  if (text === null) return null;
  try {
    return parseToml(text);
  } catch (e) {
    problems.push(`Can't read ${file}: ${errorMessage(e)}`);
    return null;
  }
}

const pick = <T extends string>(options: readonly T[], table: Table | null, key: string): T | undefined => {
  const value = table?.[key];
  return isOneOf(options, value) ? value : undefined;
};

/** Whether the user's `config.toml` trusts one of these folders: a `[projects."<path>"]` entry that names it. */
function trusted(user: Table | null, dirs: readonly string[]): boolean {
  const projects = user?.projects;
  if (!isRecord(projects)) return false;
  return Object.entries(projects).some(
    ([path, entry]) => isRecord(entry) && entry.trust_level === "trusted" && dirs.some((dir) => samePath(path, dir)),
  );
}

export interface CodexSettings {
  /** The user's `~/.codex/config.toml` and the project's `.codex/config.toml`, null when missing. */
  user: string | null;
  project: string | null;
  /** The project folder. Its ancestors count for trust too, which covers the git root. */
  dir: string;
  /** More folders a trust entry may name, such as the main checkout of a git worktree. */
  roots?: readonly string[];
}

/**
 * Codex's starting mode. A project is trusted when the user's trust table names its folder, a folder above it (the git
 * root among them) or its main checkout. The project's `config.toml` counts only for a trusted project, as Codex itself loads it, and
 * wins over the user's per key. A trusted project with neither key set starts as Codex's own trusted default
 * (on-request, workspace-write). With nothing set and no trust, no mode.
 */
export function codexStartMode({ user, project, dir, roots = [] }: CodexSettings): ModeRead {
  const problems: string[] = [];
  const userTable = parseTable(user, "~/.codex/config.toml", problems);
  const isTrusted = trusted(userTable, [...withAncestors(dir), ...roots.flatMap(withAncestors)]);
  const projectTable = isTrusted ? parseTable(project, ".codex/config.toml", problems) : null;
  const approvalFromProject = pick(CODEX_APPROVALS, projectTable, "approval_policy");
  const sandboxFromProject = pick(CODEX_SANDBOXES, projectTable, "sandbox_mode");
  const approval = approvalFromProject ?? pick(CODEX_APPROVALS, userTable, "approval_policy");
  const sandbox = sandboxFromProject ?? pick(CODEX_SANDBOXES, userTable, "sandbox_mode");
  if (!approval && !sandbox) {
    if (!isTrusted) return { mode: null, problems };
    return {
      mode: { provider: "codex", name: "on-request · workspace-write", level: "user", fullAccess: false },
      problems,
    };
  }
  return {
    mode: {
      provider: "codex",
      name: [approval, sandbox].filter(Boolean).join(" · "),
      level: approvalFromProject || sandboxFromProject ? "project" : "user",
      fullAccess: approval === "never" && sandbox === "danger-full-access",
    },
    problems,
  };
}
