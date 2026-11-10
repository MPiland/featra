/**
 * What Settings > Project > Roles shows, as plain data: its wording, the choices a role's model and effort offer, and
 * how the roles group by where they came from. The components in `components/settings/` render it.
 */
import { EFFORTS, sourceTag, type Effort, type Role } from "@featra/work-format/roles";
import { ASK_MODE, modeLabel } from "@featra/work-format/modes";
import type { ChoiceDef } from "./settings.ts";

export const ROLES_COPY = {
  title: "Roles",
  intro: "Built-in and custom roles are saved in the project's .featra/roles, shared through git.",
  providerIntro: "Claude and Codex agents are read from their own folders and never changed here.",
  none: "No project is open.",
  newRole: "New role",
  name: "Name",
  create: "Create",
  cancel: "Cancel",
  prompt: "Prompt",
  noPrompt: "No prompt.",
  model: "Model",
  effort: "Effort",
  mode: "Permission mode",
  reset: "Reset",
  duplicate: "Duplicate",
  customize: "Customize",
  delete: "Delete",
  confirmDelete: "Confirm delete",
  providerHelp: "Customize copies it into the project, where it can be edited.",
  loading: "Loading roles…",
  problems: "Can't read some role files",
  now: (value: string) => `Now: ${value}`,
} as const;

const EFFORT_LABELS: Record<Effort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};
export const EFFORT_OPTIONS: readonly ChoiceDef<string>[] = EFFORTS.map((e) => ({ value: e, label: EFFORT_LABELS[e] }));

/** Claude's own model aliases; a role file may name another model, which is then listed too. */
const MODELS = ["default", "opus", "sonnet", "haiku"];
export function modelOptions(current: string): readonly ChoiceDef<string>[] {
  return (MODELS.includes(current) ? MODELS : [...MODELS, current]).map((m) => ({ value: m, label: m }));
}

export interface RoleGroup {
  id: string;
  title: string;
  roles: Role[];
}

/** The roles in the groups the page lists them in: built-in, custom, then each provider's agents. */
export function roleGroups(roles: readonly Role[]): RoleGroup[] {
  const from = (provider: string) =>
    roles.filter((r) => r.source.kind === "provider" && r.source.provider === provider);
  const groups: RoleGroup[] = [
    { id: "built-in", title: "Built-in", roles: roles.filter((r) => r.source.kind === "built-in") },
    { id: "custom", title: "Custom", roles: roles.filter((r) => r.source.kind === "custom") },
    { id: "claude", title: "Claude agents", roles: from("claude") },
    { id: "codex", title: "Codex agents", roles: from("codex") },
  ];
  return groups.filter((g) => g.roles.length > 0);
}

/** A role row's second line: the model, the effort and the mode a chat from it starts in. */
export const roleMeta = (role: Role) => `${role.model} · ${role.effort} · ${modeLabel(role.mode ?? ASK_MODE)}`;

export { sourceTag };
