/**
 * Roles: what a chat starts from (CONTEXT.md, Role preset). Each one is a prompt appended to the agent's own system
 * prompt, plus the model, effort and permission mode the chat starts with. The five built-in roles live here, in one
 * module; STORY-6 adds custom and provider roles beside them through the server's role registry.
 */
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

export interface Role {
  id: string;
  name: string;
  provider: ProviderId;
  /** Appended to the provider's own system prompt, so the user's CLAUDE.md, skills and hooks still apply. */
  prompt: string;
  /** A model alias the provider understands (`opus`, `sonnet`, `haiku`). */
  model: string;
  effort: Effort;
  permission: PermissionMode;
}

const role = (id: string, name: string, model: string, effort: Effort, prompt: string): Role => ({
  id,
  name,
  provider: "claude",
  prompt,
  model,
  effort,
  permission: "ask",
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

/** A role read from the socket, or null when it isn't one. */
export function normalizeRole(raw: unknown): Role | null {
  if (!isRecord(raw)) return null;
  const { id, name, provider, prompt, model, effort, permission } = raw;
  if (typeof id !== "string" || !id || typeof name !== "string" || !name) return null;
  if (typeof prompt !== "string" || typeof model !== "string" || !model) return null;
  if (!isOneOf(PROVIDERS, provider) || !isOneOf(EFFORTS, effort) || !isOneOf(PERMISSION_MODES, permission)) return null;
  return { id, name, provider, prompt, model, effort, permission };
}

export function normalizeRoles(raw: unknown): Role[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeRole).filter((r): r is Role => r !== null);
}
