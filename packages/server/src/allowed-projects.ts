import { resolve } from "node:path";

/**
 * The project folders the page may act on: the ones the user opened or created. The desktop host sends the list
 * whenever it changes, as main does for project settings, so a page can't point the server at any folder it likes.
 */
export interface AllowedProjects {
  set: (dirs: readonly string[]) => void;
  has: (dir: string) => boolean;
}

/** Folder names compare without case on Windows and macOS, as the project list does. */
export function createAllowedProjects(platform: string = process.platform): AllowedProjects {
  const caseless = platform === "win32" || platform === "darwin";
  const key = (dir: string) => (caseless ? resolve(dir).toLowerCase() : resolve(dir));
  let dirs = new Set<string>();
  return {
    set: (next) => {
      dirs = new Set(next.map(key));
    },
    has: (dir) => dirs.has(key(dir)),
  };
}
