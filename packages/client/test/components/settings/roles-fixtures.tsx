/** What the Roles page tests share: roles in each kind, the list the host serves, and opening the page through the App. */
import { screen, within } from "@testing-library/react";
import type { ModeInfo } from "@featra/work-format/modes";
import { BUILT_IN_ROLES, type Role } from "@featra/work-format/roles";
import { PROJECT, renderApp } from "../../harness.tsx";
import { main, openSettings } from "./helpers.tsx";

export const AUTO: ModeInfo = { provider: "claude", name: "auto", level: "user", fullAccess: false };
export const FULL: ModeInfo = { provider: "claude", name: "bypassPermissions", level: "project", fullAccess: true };

export const builtIn = (id: string, patch: Partial<Role> = {}): Role => ({
  ...BUILT_IN_ROLES.find((r) => r.id === id)!,
  ...patch,
});
export const custom = (id: string, name: string): Role => ({
  id,
  name,
  provider: "claude",
  prompt: "Mine.",
  model: "sonnet",
  effort: "medium",
  permission: "ask",
  source: { kind: "custom" },
});
export const agent = (
  id: string,
  name: string,
  provider: "claude" | "codex",
  scope: "project" | "user" = "project",
): Role => ({
  ...custom(id, name),
  prompt: "You review.",
  description: "Reviews code",
  source: { kind: "provider", provider, scope },
});

export const LIST = {
  roles: [
    ...BUILT_IN_ROLES.map((r) => Object.assign({}, r, { mode: AUTO })),
    custom("mine", "Mine"),
    agent("claude:project:reviewer", "reviewer", "claude"),
    agent("codex:user:scout", "scout", "codex", "user"),
  ],
  problems: [".claude/agents/bad.md: no frontmatter"],
};

export async function openRoles(roleLists: Record<string, typeof LIST> = { [PROJECT.dir]: LIST }, opts = {}) {
  const app = renderApp({ roleLists, ...opts });
  await openSettings(app.user, "Roles", "Project");
  await screen.findByRole("list", { name: "Built-in" });
  return app;
}

export const rowOf = (name: string) => within(main()).getByRole("button", { name: new RegExp(`^${name}`) });
export const editor = (name: string) => screen.getByRole("region", { name });
