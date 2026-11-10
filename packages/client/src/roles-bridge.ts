/**
 * The roles bridge (STORY-6): Settings > Project > Roles reads the project's roles live and edits them through the local
 * server, which writes only `.featra/roles/`. This module holds the bridge's shape and how the client calls the server.
 */
import { errorMessage } from "@featra/work-format/guards";
import {
  EMPTY_ROLE_LIST,
  normalizeRoleEditResult,
  normalizeRoleList,
  type RoleEdit,
  type RoleEditResult,
  type RoleList,
} from "@featra/work-format/role-edit";
import type { ServerClient } from "./server-client.ts";

export type { RoleEdit, RoleEditResult, RoleList };

/** What a watch hears: the project's roles, and why they are out of date when they are. */
export interface RolesUpdate {
  list: RoleList;
  error: string | null;
}

export interface RolesBridge {
  /** Calls back with the project's roles now and on every change to their files; returns the stop. */
  watch: (dir: string, listener: (update: RolesUpdate) => void) => () => void;
  /** Makes one change to the project's roles; the watch then hears the new list. */
  edit: (dir: string, edit: RoleEdit) => Promise<RoleEditResult>;
}

/** The bridge's roles methods over the server client. */
export function serverRoles(server: ServerClient): RolesBridge {
  return {
    watch(dir, listener) {
      let list = EMPTY_ROLE_LIST;
      return server.watch(
        "roles.watch",
        { dir },
        {
          data: (raw) => {
            list = normalizeRoleList(raw);
            listener({ list, error: null });
          },
          error: (message) => listener({ list, error: message }),
        },
      );
    },
    edit: (dir, edit) =>
      server.call("roles.edit", { dir, edit }).then(normalizeRoleEditResult, (err: unknown) => ({
        ok: false,
        error: errorMessage(err),
      })),
  };
}

/** A browser tab has no folders, so no roles to edit. */
export function noRoles(error: string): RolesBridge {
  return {
    watch(_dir, listener) {
      listener({ list: EMPTY_ROLE_LIST, error });
      return () => {};
    },
    edit: async () => ({ ok: false, error }),
  };
}
