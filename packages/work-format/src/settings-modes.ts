/**
 * Reads the starting permission mode out of the providers' own settings (STORY-6): pure, so the server's readers only
 * fetch the files. Claude: `permissions.defaultMode` in the user, project and local `settings.json`, the most specific
 * file winning. Codex: `approval_policy` and `sandbox_mode` in `config.toml` (the user's, then the project's own when
 * the project is trusted), plus the `[projects."<path>"] trust_level` entry.
 */
import { parse as parseToml } from "smol-toml";
import {
  CLAUDE_FULL_ACCESS,
  CLAUDE_MODES,
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
}

/** A settings file's text (null when the file isn't there) and where it sits. */
export interface SettingsLayer {
  level: SettingsLevel;
  /** How a problem names the file. */
  file: string;
  text: string | null;
}

/** Claude's starting mode: the first layer, most specific first, that names a valid `permissions.defaultMode`. */
export function claudeStartMode(layers: readonly SettingsLayer[]): ModeRead {
  const problems: string[] = [];
  for (const layer of layers) {
    if (layer.text === null) continue;
    let settings: unknown;
    try {
      settings = JSON.parse(layer.text);
    } catch (e) {
      problems.push(`Can't read ${layer.file}: ${errorMessage(e)}`);
      continue;
    }
    const permissions = isRecord(settings) ? settings.permissions : undefined;
    const set = isRecord(permissions) ? permissions.defaultMode : undefined;
    if (set === undefined) continue;
    if (!isOneOf(CLAUDE_MODES, set)) {
      problems.push(`${layer.file} sets a permission mode Featra doesn't know.`);
      continue;
    }
    return {
      mode: { provider: "claude", name: set, level: layer.level, fullAccess: set === CLAUDE_FULL_ACCESS },
      problems,
    };
  }
  return { mode: null, problems };
}

/** A path as Codex's trust table spells it, made comparable: no `\\?\` prefix, "/" separators, drive letters folded. */
export function samePath(a: string, b: string): boolean {
  return comparable(a) === comparable(b);
}

function comparable(p: string): string {
  const s = p
    .replace(/^\\\\\?\\/, "")
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");
  return /^[a-z]:/i.test(s) ? s.toLowerCase() : s;
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

/** Whether the user's `config.toml` trusts this folder: its `[projects."<path>"]` entry. */
function trusted(user: Table | null, dir: string): boolean {
  const projects = user?.projects;
  if (!isRecord(projects)) return false;
  return Object.entries(projects).some(
    ([path, entry]) => samePath(path, dir) && isRecord(entry) && entry.trust_level === "trusted",
  );
}

export interface CodexSettings {
  /** The user's `~/.codex/config.toml` and the project's `.codex/config.toml`, null when missing. */
  user: string | null;
  project: string | null;
  /** The project folder, as the user's trust table names it. */
  dir: string;
}

/**
 * Codex's starting mode. The project's `config.toml` counts only for a trusted project, as Codex itself loads it, and
 * wins over the user's per key. A trusted project with neither key set starts as Codex's own trusted default
 * (on-request, workspace-write). With nothing set and no trust, no mode.
 */
export function codexStartMode({ user, project, dir }: CodexSettings): ModeRead {
  const problems: string[] = [];
  const userTable = parseTable(user, "~/.codex/config.toml", problems);
  const isTrusted = trusted(userTable, dir);
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
