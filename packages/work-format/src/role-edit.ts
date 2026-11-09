/**
 * Settings > Project > Roles over the socket (STORY-6): the project's roles with what couldn't be read, and the edits
 * the page makes. Provider neutral and pure, so the server, the client and the tests share one copy.
 */
import { EFFORTS, normalizeRoles, type Effort, type Role } from "./roles.ts";
import { isOneOf, isRecord } from "./utils/guards.ts";

/** What `roles.watch` answers and pushes: every role the project can start from, and the files that couldn't be read. */
export interface RoleList {
  roles: Role[];
  /** One line per file or setting that couldn't be read; the rest of the list is unaffected. */
  problems: string[];
}

export const EMPTY_ROLE_LIST: RoleList = { roles: [], problems: [] };

/** What a role's edit form saves. A custom role's name changes through `rename`. */
export interface RoleForm {
  prompt: string;
  model: string;
  effort: Effort;
}

/** One change to the project's roles. */
export type RoleEdit =
  /** Writes `.featra/roles/<id>.md`: overrides a built-in, or changes a custom role. */
  | ({ action: "save"; id: string } & RoleForm)
  /** Deletes a built-in's override file: the built-in comes back. */
  | { action: "reset"; id: string }
  /** A new custom role with this name. */
  | { action: "create"; name: string }
  /** A copy of a built-in or custom role, named "<name> 2" or the like. */
  | { action: "duplicate"; id: string }
  | { action: "rename"; id: string; name: string }
  | { action: "delete"; id: string }
  /** Copies a provider's agent into `.featra/roles/` as a custom role. */
  | { action: "customize"; id: string };

export const ROLE_ACTIONS = ["save", "reset", "create", "duplicate", "rename", "delete", "customize"] as const;

/** What an edit did: the role it made or changed, or why it was refused. */
export type RoleEditResult = { ok: true; id: string } | { ok: false; error: string };

export function normalizeRoleList(raw: unknown): RoleList {
  if (!isRecord(raw)) return EMPTY_ROLE_LIST;
  const problems = Array.isArray(raw.problems) ? raw.problems.filter((p): p is string => typeof p === "string") : [];
  return { roles: normalizeRoles(raw.roles), problems };
}

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** The `{ dir, edit }` params of `roles.edit`, or null. */
export function roleEditParams(params: unknown): { dir: string; edit: RoleEdit } | null {
  if (!isRecord(params) || !nonEmpty(params.dir) || !isRecord(params.edit)) return null;
  const { dir } = params;
  const e = params.edit;
  if (!isOneOf(ROLE_ACTIONS, e.action)) return null;
  switch (e.action) {
    case "create":
      return typeof e.name === "string" ? { dir, edit: { action: "create", name: e.name } } : null;
    case "rename":
      return nonEmpty(e.id) && typeof e.name === "string"
        ? { dir, edit: { action: "rename", id: e.id, name: e.name } }
        : null;
    case "save":
      return nonEmpty(e.id) && typeof e.prompt === "string" && typeof e.model === "string" && isOneOf(EFFORTS, e.effort)
        ? { dir, edit: { action: "save", id: e.id, prompt: e.prompt, model: e.model, effort: e.effort } }
        : null;
    case "reset":
    case "duplicate":
    case "delete":
    case "customize":
      return nonEmpty(e.id) ? { dir, edit: { action: e.action, id: e.id } } : null;
    default: {
      const unknown: never = e.action;
      return unknown;
    }
  }
}

export function normalizeRoleEditResult(raw: unknown): RoleEditResult {
  if (isRecord(raw) && raw.ok === true && nonEmpty(raw.id)) return { ok: true, id: raw.id };
  return { ok: false, error: isRecord(raw) && nonEmpty(raw.error) ? raw.error : "Something went wrong." };
}
