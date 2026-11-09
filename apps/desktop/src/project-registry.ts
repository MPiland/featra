import { mkdir, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import {
  normalizeProjectRef,
  projectNameError,
  type ProjectRef,
  type ProjectsResult,
  type ProjectsSnapshot,
} from "@featra/client/bridge";
import { errorMessage, isRecord } from "@featra/work-format";
import { createJsonStore, type JsonStore } from "@featra/server/json-store";

/**
 * The project list: `projects.json` in userData. Free of Electron imports. It keeps every folder the user opened or
 * created, the current one and where the last new project went. A folder that is gone is left out of the list but kept
 * on disk, so it comes back with its drive.
 */
interface StoredProjects {
  projects: ProjectRef[];
  current: string | null;
  lastLocation: string | null;
}

const text = (raw: unknown) => (typeof raw === "string" && raw ? raw : null);

export function normalizeStoredProjects(raw: unknown): StoredProjects {
  const r = isRecord(raw) ? raw : {};
  return {
    projects: (Array.isArray(r.projects) ? r.projects : []).map(normalizeProjectRef).filter((p) => p !== null),
    current: text(r.current),
    lastLocation: text(r.lastLocation),
  };
}

/** The project found at startup, and whether `FEATRA_PROJECT_DIR` named it (then it is current, whatever was stored). */
export interface FoundProject {
  project: ProjectRef | null;
  pinned: boolean;
}

export const projectRef = (dir: string): ProjectRef => ({ dir, name: basename(dir) || dir });

const isDir = (path: string) =>
  stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );

/**
 * The project Featra starts in when the list has none: `FEATRA_PROJECT_DIR` if set (an empty value means none), else
 * the nearest folder at or above `start` that holds a `.featra` folder.
 */
export async function findProject(start: string, override?: string): Promise<FoundProject> {
  if (override !== undefined) return { project: override ? projectRef(resolve(override)) : null, pinned: !!override };
  let dir = resolve(start);
  for (;;) {
    if (await isDir(join(dir, ".featra"))) return { project: projectRef(dir), pinned: false };
    const parent = dirname(dir);
    if (parent === dir) return { project: null, pinned: false };
    dir = parent;
  }
}

export interface ProjectRegistryDeps {
  /** The userData folder. */
  dir: string;
  /** `process.platform`: folder names are compared without case on Windows and macOS. */
  platform: string;
  /** Where New Project… suggests a folder when there is no better place (the user's Documents). */
  fallbackLocation: string;
}

export interface ProjectRegistry {
  readonly store: JsonStore<StoredProjects>;
  /** Loads the list and adds the project found at startup. */
  start: (found: FoundProject) => Promise<void>;
  snapshot: () => Promise<ProjectsSnapshot>;
  current: () => ProjectRef | null;
  /** Whether the page may read or write this project's settings: it is on the list. */
  has: (dir: unknown) => dir is string;
  switchTo: (dir: unknown) => Promise<ProjectsResult>;
  /** Adds an existing folder and switches to it. */
  open: (dir: string) => Promise<ProjectsResult>;
  /** Creates the folder `name` in `location`, adds it and switches to it. */
  create: (location: unknown, name: unknown) => Promise<ProjectsResult>;
}

export function createProjectRegistry({ dir, platform, fallbackLocation }: ProjectRegistryDeps): ProjectRegistry {
  const store = createJsonStore(dir, "projects.json", normalizeStoredProjects);
  let state: StoredProjects = { projects: [], current: null, lastLocation: null };
  const caseless = platform === "win32" || platform === "darwin";
  const key = (path: string) => (caseless ? resolve(path).toLowerCase() : resolve(path));
  const find = (path: string) => state.projects.find((p) => key(p.dir) === key(path));
  const current = () => (state.current ? (find(state.current) ?? null) : null);

  /** Puts the folder on the list (once) and returns the entry. */
  const add = (path: string): ProjectRef => {
    const known = find(path);
    if (known) return known;
    const ref = projectRef(resolve(path));
    state = { ...state, projects: [...state.projects, ref] };
    return ref;
  };

  async function snapshot(): Promise<ProjectsSnapshot> {
    const here = await Promise.all(state.projects.map((p) => isDir(p.dir)));
    const cur = current();
    const parent = cur ? dirname(cur.dir) : null;
    return {
      current: cur,
      projects: state.projects.filter((p, i) => here[i] || p === cur),
      location: state.lastLocation ?? (parent && parent !== cur?.dir ? parent : fallbackLocation),
    };
  }

  async function makeCurrent(ref: ProjectRef, patch: Partial<StoredProjects> = {}): Promise<ProjectsResult> {
    state = { ...state, ...patch, current: ref.dir };
    await store.save(state);
    return { ok: true, projects: await snapshot() };
  }

  return {
    store,
    async start(found) {
      state = await store.load();
      const before = JSON.stringify(state);
      const foundRef = found.project ? add(found.project.dir) : null;
      const stored = current();
      const keep = !found.pinned && stored && (await isDir(stored.dir)) ? stored : null;
      state = { ...state, current: (keep ?? foundRef)?.dir ?? null };
      if (JSON.stringify(state) !== before) await store.save(state);
    },
    snapshot,
    current,
    has: (path): path is string => typeof path === "string" && find(path) !== undefined,
    async switchTo(path) {
      const ref = typeof path === "string" ? find(path) : undefined;
      if (!ref) return { ok: false, error: "Not a known project." };
      if (!(await isDir(ref.dir))) return { ok: false, error: `Folder not found: ${ref.dir}` };
      return makeCurrent(ref);
    },
    async open(path) {
      if (!isAbsolute(path) || !(await isDir(path))) return { ok: false, error: `Folder not found: ${path}` };
      return makeCurrent(add(path));
    },
    async create(location, name) {
      if (typeof name !== "string" || typeof location !== "string") return { ok: false, error: "Enter a name." };
      const invalid = projectNameError(name);
      if (invalid) return { ok: false, error: invalid };
      if (!isAbsolute(location) || !(await isDir(location))) return { ok: false, error: "Location not found." };
      const folder = name.trim();
      const target = join(resolve(location), folder);
      try {
        await mkdir(target);
      } catch (err) {
        if (isRecord(err) && err.code === "EEXIST") return { ok: false, error: `"${folder}" already exists there.` };
        return { ok: false, error: `Can't create the folder: ${errorMessage(err)}` };
      }
      return makeCurrent(add(target), { lastLocation: resolve(location) });
    },
  };
}
