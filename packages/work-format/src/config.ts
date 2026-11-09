import { isMap, isScalar, parse, parseDocument, stringify } from "yaml";
import {
  CANCELLED,
  type KnowledgePermission,
  type ProgressMode,
  type ProjectConfig,
  type Stage,
  type StageCategory,
} from "./types.ts";
import { isOneOf, isRecord, toText } from "./utils/guards.ts";

export const DEFAULT_STAGES: Stage[] = [
  { name: "New", category: "not-started" },
  { name: "Ready", category: "not-started" },
  { name: "In Progress", category: "active" },
  { name: "In Review", category: "active" },
  { name: "Acceptance", category: "active" },
  { name: "Done", category: "done" },
];

export const DEFAULT_CONFIG: ProjectConfig = {
  version: 1,
  stages: DEFAULT_STAGES,
  progress: "stories",
  requireAccept: true,
  baseBranch: "main",
  worktrees: true,
  mcp: true,
  autoMerge: false,
  uat: false,
  knowledge: "propose",
};

const CATEGORIES: StageCategory[] = ["not-started", "active", "done"];

export class ConfigError extends Error {}

const BOOLEAN_KEYS = ["requireAccept", "worktrees", "mcp", "autoMerge", "uat"] as const;
const KNOWLEDGE: readonly KnowledgePermission[] = ["edit", "propose", "read-only"];
export const isKnowledgePermission = (value: unknown): value is KnowledgePermission => isOneOf(KNOWLEDGE, value);
const PROGRESS: readonly ProgressMode[] = ["stories", "tasks"];

/**
 * Reads `.featra/config.yaml`. Keys the file leaves out come from `defaults`: Featra's own by default, or the user's
 * app-wide defaults (Settings > Work defaults), which the file's keys override.
 */
export function parseConfig(text: string, defaults: ProjectConfig = DEFAULT_CONFIG): ProjectConfig {
  const config: ProjectConfig = { ...defaults, ...configOverrides(text) };
  validStages(config.stages);
  return config;
}

/**
 * The keys the file sets itself, validated: a project's overrides of the app-wide defaults. Unknown keys are left
 * out, as in `parseConfig`.
 */
export function configOverrides(text: string): Partial<ProjectConfig> {
  const raw: unknown = parse(text) ?? {};
  if (!isRecord(raw)) throw new ConfigError("config must be a mapping of settings");
  const out: Partial<ProjectConfig> = {};
  if ("version" in raw) {
    if (typeof raw.version !== "number") throw new ConfigError(`version must be a number, got ${toText(raw.version)}`);
    out.version = raw.version;
  }
  if ("stages" in raw) out.stages = validStages(raw.stages);
  if ("progress" in raw) {
    if (!isOneOf(PROGRESS, raw.progress)) {
      throw new ConfigError(`progress must be "stories" or "tasks", got ${toText(raw.progress)}`);
    }
    out.progress = raw.progress;
  }
  if ("baseBranch" in raw) {
    if (typeof raw.baseBranch !== "string" || !raw.baseBranch) {
      throw new ConfigError(`baseBranch must be a branch name, got ${toText(raw.baseBranch)}`);
    }
    out.baseBranch = raw.baseBranch;
  }
  for (const key of BOOLEAN_KEYS) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (typeof value !== "boolean") throw new ConfigError(`${key} must be true or false, got ${toText(value)}`);
    out[key] = value;
  }
  if ("knowledge" in raw) {
    if (!isOneOf(KNOWLEDGE, raw.knowledge)) {
      throw new ConfigError(`knowledge must be one of ${KNOWLEDGE.join(", ")}, got ${toText(raw.knowledge)}`);
    }
    out.knowledge = raw.knowledge;
  }
  return out;
}

/**
 * Sets one key in the config file's text, or removes it (`undefined`) so the app-wide default applies again. Edits
 * the YAML document in place, so comments, layout and keys Featra doesn't know survive. Throws a ConfigError, and
 * changes nothing, if the file can't be read or the result would not be a valid config.
 */
export function setConfigValue<K extends keyof ProjectConfig>(
  text: string,
  key: K,
  value: ProjectConfig[K] | undefined,
): string {
  const doc = parseDocument(text.trim() ? text : NEW_CONFIG);
  const [firstError] = doc.errors;
  if (firstError) throw new ConfigError(firstError.message);
  if (doc.contents !== null && !isMap(doc.contents)) throw new ConfigError("config must be a mapping of settings");
  configOverrides(text); // the file as it stands must be valid before it is edited
  if (value === undefined) doc.delete(key);
  else {
    const node = doc.get(key, true);
    // Keep a trailing comment ("progress: stories  # stories | tasks") by changing the scalar, not replacing it.
    if (isScalar(node) && (value === null || typeof value !== "object")) node.value = value;
    else doc.set(key, value);
  }
  const out = doc.toString();
  configOverrides(out);
  return out;
}

/** The project's own value for a work setting, when its config sets one and can be read. */
function ownSetting<K extends keyof ProjectConfig>(configText: string | null, key: K): ProjectConfig[K] | undefined {
  try {
    return configText === null ? undefined : configOverrides(configText)[key];
  } catch {
    return undefined;
  }
}

/**
 * Whether a project's agents get the Featra MCP (ADR 0006): the project's own `mcp`, else the app-wide default, else
 * on. A config that can't be read sets nothing, so the default applies, and Settings shows the error.
 */
export function mcpEnabled(configText: string | null, appDefault: boolean | undefined): boolean {
  return ownSetting(configText, "mcp") ?? appDefault ?? DEFAULT_CONFIG.mcp;
}

/** What agents may do to the project's knowledge files: the project's own `knowledge`, else the app default, else propose. */
export function knowledgePermission(
  configText: string | null,
  appDefault: KnowledgePermission | undefined,
): KnowledgePermission {
  return ownSetting(configText, "knowledge") ?? appDefault ?? DEFAULT_CONFIG.knowledge;
}

/** A new project's config file: only the version, so every work setting follows the app-wide defaults. */
export const NEW_CONFIG = "# Featra project settings\nversion: 1\n";

export function serializeConfig(config: ProjectConfig): string {
  return "# Featra project settings\n" + stringify(config, { flowCollectionPadding: true });
}

/** The stages list, checked: every stage named once, in a known category, with at least one done stage. */
function validStages(stages: unknown): Stage[] {
  if (!Array.isArray(stages) || stages.length === 0) throw new ConfigError("stages must be a non-empty list");
  const names = new Set<string>();
  const out: Stage[] = [];
  for (const s of stages as unknown[]) {
    if (!isRecord(s) || typeof s.name !== "string" || !s.name) throw new ConfigError("every stage needs a name");
    if (!isOneOf(CATEGORIES, s.category)) {
      throw new ConfigError(`stage "${s.name}" has unknown category "${toText(s.category)}"`);
    }
    if (s.name === CANCELLED) throw new ConfigError(`"${CANCELLED}" is reserved`);
    if (names.has(s.name)) throw new ConfigError(`duplicate stage "${s.name}"`);
    names.add(s.name);
    out.push({ name: s.name, category: s.category });
  }
  if (!out.some((s) => s.category === "done")) throw new ConfigError("at least one stage must be in the done category");
  return out;
}

/** Category of a story/bug status. Cancelled and unknown statuses return null (they count toward nothing). */
export function stageCategory(status: string, config: ProjectConfig): StageCategory | null {
  return config.stages.find((s) => s.name === status)?.category ?? null;
}

export function isKnownStatus(status: string, config: ProjectConfig): boolean {
  return status === CANCELLED || config.stages.some((s) => s.name === status);
}
