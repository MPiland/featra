import { resolve } from "node:path";

/**
 * The project folders the page may act on: the ones the user opened or created. The desktop host sends the list
 * whenever it changes, as main does for project settings, so a page can't point the server at any folder it likes.
 */
export interface AllowedProjects {
  set: (dirs: readonly string[]) => void;
  has: (dir: string) => boolean;
  /** Calls `listener` after every change of the list; returns the stop. */
  onChange: (listener: () => void) => () => void;
}

/** A project folder as it compares: resolved, and without case on Windows and macOS, as the project list does. */
export const projectKey = (dir: string, platform: string = process.platform) =>
  platform === "win32" || platform === "darwin" ? resolve(dir).toLowerCase() : resolve(dir);

export function createAllowedProjects(platform: string = process.platform): AllowedProjects {
  const key = (dir: string) => projectKey(dir, platform);
  let dirs = new Set<string>();
  const listeners = new Set<() => void>();
  return {
    set: (next) => {
      dirs = new Set(next.map(key));
      for (const listener of listeners) listener();
    },
    has: (dir) => dirs.has(key(dir)),
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
