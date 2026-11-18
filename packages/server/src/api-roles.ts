/**
 * The local API's roles methods (STORY-33): a project's roles, watched as their files change, and edited as project
 * files.
 */
import { roleEditParams } from "@featra/work-format";
import type { AllowedProjects } from "./allowed-projects.ts";
import type { Connection } from "./api.ts";
import { ApiError } from "./api-error.ts";
import type { RoleRegistry } from "./role-registry.ts";
import type { RoleWatches } from "./role-watch.ts";

export interface RoleApiDeps {
  roles: RoleRegistry;
  roleWatches: RoleWatches;
  allowed: Pick<AllowedProjects, "has">;
  /** The project folder, once it is known to be open; throws otherwise. */
  allow: (dir: string) => string;
  /** The open project `{ dir }` names; throws otherwise. */
  project: (params: unknown) => string;
}

export type RoleMethod = "roles.watch" | "roles.edit";

export function createRoleApi({ roles, roleWatches, allowed, allow, project }: RoleApiDeps) {
  return async (method: RoleMethod, params: unknown, id: number, connection: Connection) => {
    if (method === "roles.watch") {
      const dir = project(params);
      const { list, stop } = await roleWatches.watch(dir, (next) => {
        if (allowed.has(dir)) connection.push("roles.list", id, next);
      });
      connection.keep(id, stop);
      return list;
    }
    const p = roleEditParams(params);
    if (!p) throw new ApiError("Expected { dir, edit }.");
    return roles.edit(allow(p.dir), p.edit);
  };
}
