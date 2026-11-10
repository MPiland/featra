/**
 * Roles: what a chat starts from (CONTEXT.md, Role preset). Each one is a prompt appended to the agent's own system
 * prompt, plus the model, effort and permission mode the chat starts with. The five built-in roles live here, in one
 * module; STORY-6 adds custom and provider roles beside them through the server's role registry.
 */
import {
  normalizeMode,
  SETTINGS_PROVIDER_NAMES,
  SETTINGS_PROVIDERS,
  type ModeInfo,
  type SettingsProvider,
} from "./modes.ts";
import { isOneOf, isRecord } from "./utils/guards.ts";

/** How hard the model thinks, as the Agent SDK takes it per query. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** What the agent may do without asking. Only Ask exists so far: every tool that needs approval asks (STORY-45). */
export type PermissionMode = "ask";
export const PERMISSION_MODES: readonly PermissionMode[] = ["ask"];

/** The agents a role can start. Codex and ACP agents join in M2 behind the same provider adapter (ADR 0007). */
export type ProviderId = "claude";
export const PROVIDERS: readonly ProviderId[] = ["claude"];

/** Where a role comes from: Featra itself, the project's own file, or an agent definition a provider keeps. */
export type RoleSource =
  /** One of the five; `edited` when `.featra/roles/<id>.md` overrides it. */
  | { kind: "built-in"; edited: boolean }
  /** A file in `.featra/roles/`. */
  | { kind: "custom" }
  /** Claude's `.claude/agents/*.md` or Codex's `.codex/agents/*.toml`, in the project or the user's own folder. */
  | { kind: "provider"; provider: SettingsProvider; scope: "project" | "user" };

export interface Role {
  id: string;
  name: string;
  provider: ProviderId;
  /** Appended to the provider's own system prompt, so the user's CLAUDE.md, skills and hooks still apply. */
  prompt: string;
  /** A model alias the provider understands (`opus`, `sonnet`, `haiku`). */
  model: string;
  effort: Effort;
  /** What a role starts in when no provider setting names a mode (STORY-45): Ask. */
  permission: PermissionMode;
  source: RoleSource;
  /** What the provider's agent file says it is for. */
  description?: string;
  /** The mode a chat from it starts in, read live from the provider's settings (STORY-6); Ask when absent. */
  mode?: ModeInfo;
  /** Claude's settings remove auto mode, so a chat from this role is not offered it (`disableAutoMode`). */
  autoOff?: boolean;
  /** One line on how the role was adjusted to run, such as a model Claude doesn't have. */
  note?: string;
}

/** The tag a role's source shows: where it came from. */
export function sourceTag(source: RoleSource): string {
  switch (source.kind) {
    case "built-in":
      return source.edited ? "Built-in · edited" : "Built-in";
    case "custom":
      return "Custom";
    case "provider":
      return `${SETTINGS_PROVIDER_NAMES[source.provider]} · ${source.scope}`;
    default: {
      const unknown: never = source;
      return unknown;
    }
  }
}

const role = (id: string, name: string, model: string, effort: Effort, prompt: string): Role => ({
  id,
  name,
  provider: "claude",
  prompt,
  model,
  effort,
  permission: "ask",
  source: { kind: "built-in", edited: false },
});

/** The five built-in roles, in the order the picker lists them. */
export const BUILT_IN_ROLES: readonly Role[] = [
  role(
    "researcher",
    "Researcher",
    "sonnet",
    "medium",
    "You are the Researcher on a Featra project. Investigate questions against primary sources, compare options, " +
      "and report findings with their sources. Don't change code unless the user asks.",
  ),
  role(
    "analyst",
    "Analyst/Refiner",
    "opus",
    "high",
    "You are the Analyst/Refiner on a Featra project. Turn ideas into features and stories: vertical slices with " +
      "clear acceptance criteria. Ask the questions that settle scope before you write anything down.",
  ),
  role(
    "dev-lead",
    "Dev Lead",
    "opus",
    "high",
    "You are the Dev Lead on a Featra project. Shape features with the user, plan the stories, review the " +
      "developers' work against the acceptance criteria and the project's standards, and keep decisions recorded.",
  ),
  role(
    "developer",
    "Developer",
    "sonnet",
    "high",
    "You are a Developer on a Featra project. Build the story you are given end to end, prove every acceptance " +
      "criterion with a test that runs real code, and keep to the project's standards.",
  ),
  role(
    "qa",
    "QA",
    "sonnet",
    "medium",
    "You are QA on a Featra project. Test the story against its acceptance criteria, try the edge cases, and " +
      "report what fails with the steps to reproduce it.",
  ),
];

const SCOPES = ["project", "user"] as const;

function normalizeSource(raw: unknown): RoleSource {
  if (isRecord(raw) && raw.kind === "custom") return { kind: "custom" };
  if (
    isRecord(raw) &&
    raw.kind === "provider" &&
    isOneOf(SETTINGS_PROVIDERS, raw.provider) &&
    isOneOf(SCOPES, raw.scope)
  )
    return { kind: "provider", provider: raw.provider, scope: raw.scope };
  return { kind: "built-in", edited: isRecord(raw) && raw.edited === true };
}

const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** A role read from the socket, or null when it isn't one. */
export function normalizeRole(raw: unknown): Role | null {
  if (!isRecord(raw)) return null;
  const { id, name, provider, prompt, model, effort, permission, description, mode, note } = raw;
  if (!text(id) || !text(name) || typeof prompt !== "string" || !text(model)) return null;
  if (!isOneOf(PROVIDERS, provider) || !isOneOf(EFFORTS, effort) || !isOneOf(PERMISSION_MODES, permission)) return null;
  const read = normalizeMode(mode);
  return {
    id,
    name,
    provider,
    prompt,
    model,
    effort,
    permission,
    source: normalizeSource(raw.source),
    ...(text(description) ? { description } : {}),
    ...(read ? { mode: read } : {}),
    ...(text(note) ? { note } : {}),
  };
}

export function normalizeRoles(raw: unknown): Role[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeRole).filter((r): r is Role => r !== null);
}
