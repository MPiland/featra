/**
 * What the Roles page's edits do on disk (STORY-6). Every write is a file in `.featra/roles/`: a built-in's override
 * (Reset deletes it), or a custom role. The providers' own files are only ever read.
 */
import { join } from "node:path";
import {
  nameProblem,
  NEW_ROLE,
  newRoleId,
  roleFile,
  ROLES_DIR,
  serializeRoleFile,
  uniqueName,
  type Role,
  type RoleEdit,
  type RoleEditResult,
  type RoleFields,
} from "@featra/work-format";
import type { RoleFs } from "./role-fs.ts";
import type { RoleFiles } from "./role-registry.ts";

const lower = (s: string) => s.toLowerCase();
const fileStem = (name: string) => name.replace(/\.md$/i, "");

const refuse = (error: string): RoleEditResult => ({ ok: false, error });

const copy = (role: Role, name: string): RoleFields => ({
  name,
  model: role.model,
  effort: role.effort,
  prompt: role.prompt,
});

export async function applyRoleEdit(
  fs: RoleFs,
  dir: string,
  edit: RoleEdit,
  roles: readonly Role[],
  files: RoleFiles,
): Promise<RoleEditResult> {
  const path = (id: string) => join(dir, ROLES_DIR, roleFile(id));
  const put = async (id: string, fields: Partial<RoleFields>): Promise<RoleEditResult> => {
    await fs.write(path(id), serializeRoleFile(fields));
    return { ok: true, id };
  };
  const names = (except?: string) => roles.filter((r) => r.id !== except).map((r) => r.name);
  // Ids already in use, lower case: the roles' own, and every file in the folder, whether it parsed or not. A file
  // system that ignores case would make `Qa.md` and `qa.md` one file.
  const taken = async () =>
    new Set([...roles.map((r) => r.id), ...(await fs.list(join(dir, ROLES_DIR))).map(fileStem)].map(lower));
  const putNew = async (name: string, fields: RoleFields): Promise<RoleEditResult> => {
    const id = newRoleId(name, await taken());
    if ((await fs.read(path(id))) !== null) return refuse("A role file by that name is already there.");
    return put(id, fields);
  };
  const target = "id" in edit ? roles.find((r) => r.id === edit.id) : undefined;
  if ("id" in edit && !target) return refuse("That role isn't there any more.");
  switch (edit.action) {
    case "create": {
      const problem = nameProblem(edit.name, names());
      if (problem) return refuse(problem);
      return putNew(edit.name, { ...NEW_ROLE, name: edit.name.trim() });
    }
    case "save": {
      if (!target || target.source.kind === "provider") return refuse("Customize it first to change it.");
      const { id, prompt, model, effort } = edit;
      if (model !== undefined && !model.trim()) return refuse("Give the role a model.");
      const changed = {
        ...(prompt !== undefined ? { prompt } : {}),
        ...(model !== undefined ? { model: model.trim() } : {}),
        ...(effort !== undefined ? { effort } : {}),
      };
      // A built-in's file holds only what the user changed, so the rest keeps following Featra; a custom role's holds all.
      const base = target.source.kind === "built-in" ? (files.raw.get(id) ?? {}) : copy(target, target.name);
      return put(id, { ...base, ...changed });
    }
    case "reset": {
      if (target?.source.kind !== "built-in") return refuse("Only a built-in role can be reset.");
      await fs.remove(path(target.id));
      return { ok: true, id: target.id };
    }
    case "duplicate": {
      if (!target || target.source.kind === "provider") return refuse("Customize it to copy it.");
      const name = uniqueName(target.name, names());
      return putNew(name, copy(target, name));
    }
    case "rename": {
      if (target?.source.kind !== "custom") return refuse("Only a custom role can be renamed.");
      const problem = nameProblem(edit.name, names(target.id));
      if (problem) return refuse(problem);
      return put(target.id, copy(target, edit.name.trim()));
    }
    case "delete": {
      if (target?.source.kind !== "custom") return refuse("Only a custom role can be deleted.");
      await fs.remove(path(target.id));
      return { ok: true, id: target.id };
    }
    case "customize": {
      if (target?.source.kind !== "provider") return refuse("Only a provider's role can be customized.");
      const name = uniqueName(target.name, names());
      return putNew(name, copy(target, name));
    }
    default: {
      const unknown: never = edit;
      return refuse(`Unknown edit ${String(unknown)}`);
    }
  }
}
