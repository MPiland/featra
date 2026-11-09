/**
 * The role registry seam (ADR 0018, STORY-6): where the session manager, `chat.roles` and Settings > Roles get a
 * project's roles. The five built-ins (with `.featra/roles/<id>.md` overriding them), the project's custom roles in the
 * same folder, then the providers' own agent files. All of it is read live on each call; only `.featra/roles/` is
 * ever written. Without dependencies it is the five built-ins, and nothing can be edited.
 */
import { join } from "node:path";
import {
  BUILT_IN_ROLES,
  BYPASS_DISABLED_NOTE,
  errorMessage,
  fitModel,
  parseRoleFile,
  roleIdOf,
  ROLES_DIR,
  type ModeRead,
  type Role,
  type RoleEdit,
  type RoleEditResult,
  type RoleFields,
  type RoleList,
} from "@featra/work-format";
import type { ProviderReader, WatchTarget } from "./provider-reader.ts";
import { applyRoleEdit } from "./role-actions.ts";
import type { RoleFs } from "./role-fs.ts";

export interface RoleRegistry {
  /** The roles a chat in the project can start from, in picker order. */
  list: (dir: string) => Promise<Role[]>;
  /** One role by id, or null when the project has none by that id. */
  get: (dir: string, id: string) => Promise<Role | null>;
  /** The roles and what couldn't be read, for Settings. */
  read: (dir: string) => Promise<RoleList>;
  /** What to watch for the project's roles to show without a restart. */
  watched: (dir: string) => WatchTarget[];
  edit: (dir: string, edit: RoleEdit) => Promise<RoleEditResult>;
}

export interface RoleRegistryDeps {
  fs: RoleFs;
  readers: readonly ProviderReader[];
  log?: (message: string) => void;
}

/** What `.featra/roles/` holds, read: the built-in overrides by role id, the custom roles, and what couldn't be read. */
export interface RoleFiles {
  overrides: Map<string, Role>;
  /** What each override file itself says, so a save writes only what changed and the rest stays Featra's. */
  raw: Map<string, Partial<RoleFields>>;
  custom: Role[];
  problems: string[];
}

/** Claude runs every chat in M1 (ADR 0018), so its settings name the mode; Codex's are read but have no runner yet. */
const RUNNER = "claude";

async function readRoleFiles(fs: RoleFs, dir: string): Promise<RoleFiles> {
  const folder = join(dir, ROLES_DIR);
  const found: RoleFiles = { overrides: new Map(), raw: new Map(), custom: [], problems: [] };
  let names: string[];
  try {
    names = (await fs.list(folder)).toSorted();
  } catch (e) {
    found.problems.push(`Can't read ${ROLES_DIR}: ${errorMessage(e)}`);
    return found;
  }
  for (const file of names) {
    const id = roleIdOf(file);
    if (id === null) continue;
    try {
      const text = await fs.read(join(folder, file));
      if (text === null) continue;
      const read = parseRoleFile(text);
      if (!read.ok) {
        found.problems.push(`Can't read ${ROLES_DIR}/${file}: ${read.error}`);
        continue;
      }
      const { fields } = read;
      const built = BUILT_IN_ROLES.find((r) => r.id === id);
      if (built) {
        found.raw.set(id, fields);
        found.overrides.set(id, {
          ...built,
          ...(fields.name ? { name: fields.name } : {}),
          prompt: fields.prompt ?? built.prompt,
          model: fields.model ?? built.model,
          effort: fields.effort ?? built.effort,
          source: { kind: "built-in", edited: true },
        });
      } else {
        found.custom.push({
          id,
          name: fields.name ?? id,
          provider: "claude",
          prompt: fields.prompt ?? "",
          model: fields.model ?? "sonnet",
          effort: fields.effort ?? "medium",
          permission: "ask",
          source: { kind: "custom" },
        });
      }
    } catch (e) {
      found.problems.push(`Can't read ${ROLES_DIR}/${file}: ${errorMessage(e)}`);
    }
  }
  return found;
}

/**
 * The role as a chat runs it: a model Claude has (or its default, with a note), and its mode: the agent's own
 * `permissionMode`, else the one Claude's settings name. Bypass is never run when Claude's settings switch it off.
 */
function runnable(role: Role, read: ModeRead): Role {
  const { model, note: modelNote } = fitModel(role.model);
  const { mode: own, note: roleNote, ...rest } = role;
  const blocked = own?.fullAccess === true && read.bypassOff === true;
  const mode = blocked ? null : (own ?? read.mode);
  const modeNote = blocked ? BYPASS_DISABLED_NOTE : own ? null : (read.note ?? null);
  const note = [roleNote, modelNote, modeNote].filter(Boolean).join(" ");
  // With no mode the role starts on Ask, which is how an absent mode reads.
  return { ...rest, model, ...(mode && mode.level !== null ? { mode } : {}), ...(note ? { note } : {}) };
}

const BUILT_INS_ONLY: RoleRegistry = {
  list: async () => [...BUILT_IN_ROLES],
  get: async (_dir, id) => BUILT_IN_ROLES.find((r) => r.id === id) ?? null,
  read: async () => ({ roles: [...BUILT_IN_ROLES], problems: [] }),
  watched: () => [],
  edit: async () => ({ ok: false, error: "Roles can't be edited here." }),
};

export function createRoleRegistry(deps?: RoleRegistryDeps): RoleRegistry {
  if (!deps) return BUILT_INS_ONLY;
  const { fs, readers, log = () => {} } = deps;

  async function scan(dir: string): Promise<{ list: RoleList; files: RoleFiles }> {
    const [files, agents, modes] = await Promise.all([
      readRoleFiles(fs, dir),
      Promise.all(
        readers.map((r) => r.agents(dir).catch((e: unknown) => ({ roles: [], problems: [errorMessage(e)] }))),
      ),
      Promise.all(readers.map((r) => r.mode(dir).catch((e: unknown) => ({ mode: null, problems: [errorMessage(e)] })))),
    ]);
    const read = modes[readers.findIndex((r) => r.id === RUNNER)] ?? { mode: null, problems: [] };
    const base = [
      ...BUILT_IN_ROLES.map((r) => files.overrides.get(r.id) ?? r),
      ...files.custom.toSorted((a, b) => a.name.localeCompare(b.name)),
      ...agents.flatMap((a) => a.roles),
    ];
    const problems = [...files.problems, ...agents.flatMap((a) => a.problems), ...modes.flatMap((m) => m.problems)];
    for (const p of problems) log(p);
    return { list: { roles: base.map((r) => runnable(r, read)), problems }, files };
  }

  const read = async (dir: string) => (await scan(dir)).list;
  return {
    list: async (dir) => (await read(dir)).roles,
    get: async (dir, id) => (await read(dir)).roles.find((r) => r.id === id) ?? null,
    read,
    watched: (dir) => [
      { path: dir, names: [".featra"] },
      { path: join(dir, ".featra"), names: ["roles"] },
      { path: join(dir, ROLES_DIR) },
      ...readers.flatMap((r) => r.watched(dir)),
    ],
    async edit(dir, edit) {
      const { list, files } = await scan(dir);
      try {
        return await applyRoleEdit(fs, dir, edit, list.roles, files);
      } catch (e) {
        return { ok: false, error: `Couldn't save: ${errorMessage(e)}` };
      }
    },
  };
}
