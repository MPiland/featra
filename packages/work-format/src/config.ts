import { parse, stringify } from "yaml";
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
  progress: "pbis",
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

export function parseConfig(text: string): ProjectConfig {
  const raw = (parse(text) ?? {}) as Record<string, unknown>;
  const config: ProjectConfig = { ...DEFAULT_CONFIG, ...pick(raw) };
  validateStages(config.stages);
  if (config.progress !== "pbis" && config.progress !== "tasks") {
    throw new ConfigError(`progress must be "pbis" or "tasks", got ${String(config.progress)}`);
  }
  return config;
}

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

/** Category of a PBI/bug status. Cancelled and unknown statuses return null (they count toward nothing). */
export function stageCategory(status: string, config: ProjectConfig): StageCategory | null {
  return config.stages.find((s) => s.name === status)?.category ?? null;
}

export function isKnownStatus(status: string, config: ProjectConfig): boolean {
  return status === CANCELLED || config.stages.some((s) => s.name === status);
}
