import { isMap, isScalar, parse, parseDocument, stringify } from "yaml";
import { CANCELLED, type ProjectConfig, type Stage, type StageCategory } from "./types.ts";

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
const KNOWLEDGE = ["edit", "propose", "read-only"];

/**
 * Reads `.featra/config.yaml`. Keys the file leaves out come from `defaults`: Featra's own by default, or the user's
 * app-wide defaults (Settings > Work defaults), which the file's keys override.
 */
export function parseConfig(text: string, defaults: ProjectConfig = DEFAULT_CONFIG): ProjectConfig {
  const config: ProjectConfig = { ...defaults, ...configOverrides(text) };
  validateStages(config.stages);
  return config;
}

/**
 * The keys the file sets itself, validated: a project's overrides of the app-wide defaults. Unknown keys are left
 * out, as in `parseConfig`.
 */
export function configOverrides(text: string): Partial<ProjectConfig> {
  const raw = parse(text) ?? {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new ConfigError("config must be a mapping of settings");
  const out = pick(raw as Record<string, unknown>);
  if ("stages" in out) validateStages(out.stages);
  if ("progress" in out && out.progress !== "stories" && out.progress !== "tasks") {
    throw new ConfigError(`progress must be "stories" or "tasks", got ${String(out.progress)}`);
  }
  for (const key of BOOLEAN_KEYS) {
    if (key in out && typeof out[key] !== "boolean") throw new ConfigError(`${key} must be true or false, got ${String(out[key])}`);
  }
  if ("knowledge" in out && !KNOWLEDGE.includes(out.knowledge as string)) {
    throw new ConfigError(`knowledge must be one of ${KNOWLEDGE.join(", ")}, got ${String(out.knowledge)}`);
  }
  return out;
}

/**
 * Sets one key in the config file's text, or removes it (`undefined`) so the app-wide default applies again. Edits
 * the YAML document in place, so comments, layout and keys Featra doesn't know survive. Throws a ConfigError, and
 * changes nothing, if the file can't be read or the result would not be a valid config.
 */
export function setConfigValue<K extends keyof ProjectConfig>(text: string, key: K, value: ProjectConfig[K] | undefined): string {
  const doc = parseDocument(text.trim() ? text : NEW_CONFIG);
  if (doc.errors.length > 0) throw new ConfigError(doc.errors[0]!.message);
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

const NEW_CONFIG = "# Featra project settings\nversion: 1\n";

export function serializeConfig(config: ProjectConfig): string {
  return "# Featra project settings\n" + stringify(config, { flowCollectionPadding: true });
}

function pick(raw: Record<string, unknown>): Partial<ProjectConfig> {
  const out: Partial<ProjectConfig> = {};
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof ProjectConfig)[]) {
    if (key in raw) (out as Record<string, unknown>)[key] = raw[key];
  }
  return out;
}

function validateStages(stages: unknown): asserts stages is Stage[] {
  if (!Array.isArray(stages) || stages.length === 0) throw new ConfigError("stages must be a non-empty list");
  const names = new Set<string>();
  for (const s of stages as Stage[]) {
    if (!s || typeof s.name !== "string" || !s.name) throw new ConfigError("every stage needs a name");
    if (!CATEGORIES.includes(s.category)) throw new ConfigError(`stage "${s.name}" has unknown category "${s.category}"`);
    if (s.name === CANCELLED) throw new ConfigError(`"${CANCELLED}" is reserved`);
    if (names.has(s.name)) throw new ConfigError(`duplicate stage "${s.name}"`);
    names.add(s.name);
  }
  if (!(stages as Stage[]).some((s) => s.category === "done")) throw new ConfigError("at least one stage must be in the done category");
}

/** Category of a story/bug status. Cancelled and unknown statuses return null (they count toward nothing). */
export function stageCategory(status: string, config: ProjectConfig): StageCategory | null {
  return config.stages.find((s) => s.name === status)?.category ?? null;
}

export function isKnownStatus(status: string, config: ProjectConfig): boolean {
  return status === CANCELLED || config.stages.some((s) => s.name === status);
}
