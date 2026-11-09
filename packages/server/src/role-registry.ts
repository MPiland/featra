/**
 * The role registry seam (ADR 0018): where the session manager and `chat.roles` get a project's roles. Today the
 * five built-in roles; STORY-6 adds the project's `.featra/roles/*.md` and the providers' own agent files here.
 */
import { BUILT_IN_ROLES, type Role } from "@featra/work-format";

export interface RoleRegistry {
  /** The roles a chat in the project can start from, in picker order. */
  list: (dir: string) => Promise<Role[]>;
  /** One role by id, or null when the project has none by that id. */
  get: (dir: string, id: string) => Promise<Role | null>;
}

export function createRoleRegistry(): RoleRegistry {
  return {
    list: async () => [...BUILT_IN_ROLES],
    get: async (_dir, id) => BUILT_IN_ROLES.find((r) => r.id === id) ?? null,
  };
}
