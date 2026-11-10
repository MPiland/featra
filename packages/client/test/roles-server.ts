// The local server's roles side, as a fake at the socket boundary: the lists it serves, every edit it was asked for, and
// a push for when a file changes. Which files an edit writes, and how the list is built from them, is the server's own
// logic, proved in packages/server and in the Electron journey; here only what the page does with a list and a reply.
import { act } from "react";
import { EMPTY_ROLE_LIST, type RoleEdit, type RoleEditResult, type RoleList } from "@featra/work-format/role-edit";
import type { RolesBridge, RolesUpdate } from "../src/roles-bridge.ts";

export interface RolesHost {
  /** Each project's roles as the server sends them. Default: none. */
  roleLists?: Record<string, RoleList>;
  /** What `roles.edit` answers, by edit. Default: ok, for the role the edit names. */
  editResult?: (edit: RoleEdit) => RoleEditResult;
  /** Folders whose roles can't be read: the server's error. */
  roleErrors?: Record<string, string>;
}

export function fakeRolesServer(calls: string[], host: RolesHost = {}) {
  const lists = new Map(Object.entries(host.roleLists ?? {}));
  const watchers = new Map<string, Set<(u: RolesUpdate) => void>>();
  const edits: { dir: string; edit: RoleEdit }[] = [];
  const listOf = (dir: string) => lists.get(dir) ?? EMPTY_ROLE_LIST;
  const bridge: RolesBridge = {
    watch: (dir, listener) => {
      const set = watchers.get(dir) ?? new Set();
      watchers.set(dir, set.add(listener));
      calls.push(`roles.watch:${dir}`);
      queueMicrotask(() => listener({ list: listOf(dir), error: host.roleErrors?.[dir] ?? null }));
      return () => void set.delete(listener);
    },
    edit: async (dir, edit) => {
      calls.push(`roles.edit:${dir}:${edit.action}`);
      edits.push({ dir, edit });
      return host.editResult?.(edit) ?? { ok: true, id: "id" in edit ? edit.id : "new-role" };
    },
  };
  return {
    bridge,
    edits,
    /** A role file changes: the server pushes the new list to every watcher of the folder. */
    push: (dir: string, list: RoleList) =>
      act(() => {
        lists.set(dir, list);
        for (const l of watchers.get(dir) ?? []) l({ list, error: null });
      }),
    watching: (dir: string) => watchers.get(dir)?.size ?? 0,
  };
}
