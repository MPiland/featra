/**
 * Something that runs per allowed project: started for each project as it is added, stopped as it is removed and on
 * close. Story checks (STORY-56) and story PRs (STORY-11) both watch projects this way.
 */
import type { AllowedProjects } from "./allowed-projects.ts";

/** Starts one project's watch; resolves to how to stop it. */
export type StartProject = (dir: string) => Promise<() => void>;

function noop() {}

export function watchProjects(
  allowed: Pick<AllowedProjects, "dirs" | "has" | "onChange">,
  start: StartProject,
  log: (message: string) => void,
  what: string,
) {
  const watching = new Map<string, () => void>();
  const starting = new Set<Promise<void>>();
  let closed = false;

  const begin = async (dir: string, token: () => void) => {
    const stop = await start(dir);
    // The project may have been removed (or removed and added again), or everything closed, while it started.
    if (closed || watching.get(dir) !== token) return stop();
    watching.set(dir, stop);
  };

  const sync = () => {
    for (const [dir, stop] of watching) {
      if (allowed.has(dir)) continue;
      stop();
      watching.delete(dir);
    }
    for (const dir of allowed.dirs()) {
      if (watching.has(dir) || closed) continue;
      // A fresh function per start: the watch's place until it has started, told apart from a later start's.
      const token = noop.bind(null);
      watching.set(dir, token);
      const started = begin(dir, token).catch((err: unknown) => {
        if (watching.get(dir) === token) watching.delete(dir);
        log(`${what} can't watch ${dir}: ${err instanceof Error ? err.message : String(err)}`);
      });
      starting.add(started);
      void started.finally(() => starting.delete(started));
    }
  };
  const stopSync = allowed.onChange(sync);
  sync();

  return {
    /** Waits for the watches still starting. */
    async ready() {
      while (starting.size) await Promise.all(starting);
    },
    close() {
      closed = true;
      stopSync();
      for (const stop of watching.values()) stop();
      watching.clear();
    },
  };
}
