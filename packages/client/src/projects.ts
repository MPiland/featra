/**
 * The project list: the folders Featra knows, and the one it is working in. The host keeps the list (Electron's
 * userData, `projects.json`); this module holds the shapes that cross the bridge and the rules both sides check.
 */
import { isRecord } from "@featra/work-format/guards";

export interface ProjectRef {
  /** Absolute path of the project folder. */
  dir: string;
  name: string;
}

export interface ProjectsSnapshot {
  /** The project Featra is working in, or null. */
  current: ProjectRef | null;
  /** Every known project whose folder is there, in the order they were added. */
  projects: ProjectRef[];
  /** Where New Project… suggests creating the folder. Empty where there are no folders (a browser tab). */
  location: string;
}

/** What a project action did: the new list, or why nothing changed. */
export type ProjectsResult = { ok: true; projects: ProjectsSnapshot } | { ok: false; error: string };

export const EMPTY_PROJECTS: ProjectsSnapshot = { current: null, projects: [], location: "" };

/** Menu and dialog wording, shown in the File menu and the project switcher alike. */
export const PROJECT_LABELS = {
  newProject: "New Project…",
  openFolder: "Open Folder…",
  projectSettings: "Project Settings…",
  switcher: "Switch project",
} as const;

export function normalizeProjectRef(raw: unknown): ProjectRef | null {
  const r = isRecord(raw) ? raw : {};
  return typeof r.dir === "string" && r.dir && typeof r.name === "string" ? { dir: r.dir, name: r.name } : null;
}

export function normalizeProjects(raw: unknown): ProjectsSnapshot {
  const r = isRecord(raw) ? raw : {};
  const projects = (Array.isArray(r.projects) ? r.projects : []).map(normalizeProjectRef).filter((p) => p !== null);
  const current = normalizeProjectRef(r.current);
  if (current && !projects.some((p) => p.dir === current.dir)) projects.unshift(current);
  return { current, projects, location: typeof r.location === "string" ? r.location : "" };
}

export function normalizeProjectsResult(raw: unknown): ProjectsResult {
  const r = isRecord(raw) ? raw : {};
  if (r.ok === true) return { ok: true, projects: normalizeProjects(r.projects) };
  return { ok: false, error: typeof r.error === "string" && r.error ? r.error : "Something went wrong." };
}

/** The letter on the project's avatar. */
export const projectInitial = (name: string): string => (name.trim().at(0) ?? "?").toUpperCase();

// Characters no folder name may hold on Windows, and "/" everywhere. Control characters are checked separately.
const FORBIDDEN = /[<>:"/\\|?*]/;
const hasControl = (name: string) => Array.from(name).some((c) => (c.codePointAt(0) ?? 0) < 32);
// Device names Windows reserves, with or without an extension ("con", "nul.txt").
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Why a new project's folder name can't be used, or null when it can. The same rules on every platform, so a
 * project made on Linux can still be cloned on Windows.
 */
export function projectNameError(name: string): string | null {
  const n = name.trim();
  if (!n) return "Enter a name.";
  if (n === "." || n === "..") return "Choose another name.";
  if (FORBIDDEN.test(n) || hasControl(n)) return "A name can't contain \\ / : * ? \" < > |";
  if (RESERVED.test(n)) return "That name is reserved on Windows.";
  if (/[. ]$/.test(n)) return "A name can't end with a dot or a space.";
  if (n.length > 255) return "That name is too long.";
  return null;
}
