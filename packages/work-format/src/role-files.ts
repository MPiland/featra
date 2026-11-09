/**
 * Featra's own role files, `.featra/roles/<id>.md` (STORY-6): frontmatter (`name`, `model`, `effort`) and the prompt as
 * the body. A file named for a built-in role's id overrides it; any other is a custom role. Pure: the server reads and
 * writes the files. Also the rules for a role's name, its id and the model Claude can run.
 */
import { joinFrontmatter, splitFrontmatter } from "./frontmatter.ts";
import { EFFORTS, type Effort } from "./roles.ts";
import { isOneOf } from "./utils/guards.ts";

/** Where a project keeps its role files, relative to the project folder. */
export const ROLES_DIR = ".featra/roles";

export interface RoleFields {
  name: string;
  model: string;
  effort: Effort;
  prompt: string;
}

/** What a new custom role starts with. */
export const NEW_ROLE: Omit<RoleFields, "name"> = { model: "sonnet", effort: "medium", prompt: "" };

export type RoleFileRead = { ok: true; fields: Partial<RoleFields> } | { ok: false; error: string };

/** A role file's fields (any may be missing: a built-in override keeps the built-in's), or why it can't be read. */
export function parseRoleFile(text: string): RoleFileRead {
  const file = splitFrontmatter(text);
  if ("error" in file) return { ok: false, error: file.error };
  const { name, model, effort } = file.data;
  if (name !== undefined && (typeof name !== "string" || !name.trim())) return { ok: false, error: "name is empty" };
  if (model !== undefined && (typeof model !== "string" || !model.trim()))
    return { ok: false, error: "model is empty" };
  if (effort !== undefined && !isOneOf(EFFORTS, effort)) return { ok: false, error: "unknown effort" };
  return {
    ok: true,
    fields: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(model !== undefined ? { model: model.trim() } : {}),
      ...(effort !== undefined ? { effort } : {}),
      prompt: file.body,
    },
  };
}

export const serializeRoleFile = ({ name, model, effort, prompt }: RoleFields): string =>
  joinFrontmatter({ name, model, effort }, prompt);

/** The file's name for a role id. */
export const roleFile = (id: string) => `${id}.md`;

/** The role id a file name stands for, or null when it isn't a role file. */
export function roleIdOf(fileName: string): string | null {
  const id = fileName.endsWith(".md") ? fileName.slice(0, -3) : null;
  return id !== null && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) ? id : null;
}

export const NAME_MAX = 60;

/** Why `name` can't be a role's name (blank, too long, or another role has it), or null when it can. */
export function nameProblem(name: string, others: readonly string[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Give the role a name.";
  if (trimmed.length > NAME_MAX) return `Keep the name to ${NAME_MAX} characters.`;
  if (others.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return `A role named "${trimmed}" already exists.`;
  return null;
}

/** `base`, or `base 2`, `base 3`… until no other role has the name. */
export function uniqueName(base: string, others: readonly string[]): string {
  const taken = new Set(others.map((n) => n.toLowerCase()));
  let name = base.trim().slice(0, NAME_MAX);
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.trim().slice(0, NAME_MAX - 4)} ${n}`;
  return name;
}

/** A role id for a name: lower case words joined by "-", made unique among `taken` ids. */
export function newRoleId(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "role";
  let id = base;
  for (let n = 2; taken.has(id.toLowerCase()); n++) id = `${base}-${n}`;
  return id;
}

/** A model name Claude takes: its aliases (with the 1M-context form) or a full `claude-…` id. */
const CLAUDE_MODEL = /^(default|best|opusplan|(sonnet|opus|haiku)(\[1m\])?|claude-[\w.-]+(\[1m\])?)$/i;

/**
 * The model a Claude session can use for `model`: Claude's own, or "default" (Claude's default) for one it doesn't
 * have, with a one-line note. A missing model, or Claude agents' `inherit`, is Claude's default too.
 */
export function fitModel(model: string | undefined): { model: string; note: string | null } {
  const m = model?.trim() ?? "";
  if (!m || m.toLowerCase() === "inherit" || m.toLowerCase() === "default") return { model: "default", note: null };
  if (CLAUDE_MODEL.test(m)) return { model: m, note: null };
  return { model: "default", note: `Claude doesn't have the model "${m}": using Claude's default.` };
}
