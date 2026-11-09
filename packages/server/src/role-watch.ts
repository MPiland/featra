/**
 * Keeps Settings > Roles current (STORY-6): one watch per Roles page, on `.featra/roles/` and on every provider file the
 * registry reads, so an agent file or a setting changed outside Featra shows without a restart. A change rereads the
 * roles after a short settle and tells the listener only when the list differs. Folders not made yet are watched
 * through their parent, and the targets are chosen again after each read so a new folder is picked up.
 */
import { watch, type FSWatcher } from "node:fs";
import { basename, isAbsolute } from "node:path";
import { errorMessage, type RoleList } from "@featra/work-format";
import type { WatchTarget } from "./provider-reader.ts";
import type { RoleRegistry } from "./role-registry.ts";
import { SETTLE_MS, type WatchFolder } from "./work-watch.ts";

export interface RoleWatches {
  /** The project's roles now, then `listener` with each changed list until `stop`. */
  watch: (dir: string, listener: (list: RoleList) => void) => Promise<{ list: RoleList; stop: () => void }>;
}

/** The targets with one entry per path: the names each wants, or everything when any wants the whole folder. */
function merged(targets: readonly WatchTarget[]): WatchTarget[] {
  const byPath = new Map<string, Set<string> | null>();
  for (const { path, names } of targets) {
    const have = byPath.get(path);
    if (have === null) continue;
    if (!names) byPath.set(path, null);
    else byPath.set(path, new Set([...(have ?? []), ...names]));
  }
  return [...byPath].map(([path, names]) => (names ? { path, names: [...names].toSorted() } : { path }));
}

const keyOf = (t: WatchTarget) => `${t.path}|${t.names?.join(",") ?? "*"}`;

export function createRoleWatches(
  roles: RoleRegistry,
  log: (message: string) => void,
  watchFolder: WatchFolder = watch,
): RoleWatches {
  return {
    async watch(dir, listener) {
      const watchers = new Map<string, FSWatcher>();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let closed = false;
      let queue: Promise<unknown> = Promise.resolve();
      let last = "";

      const rewatch = () => {
        const wanted = new Map(merged(roles.watched(dir)).map((t) => [keyOf(t), t]));
        for (const [key, w] of watchers) {
          if (wanted.has(key)) continue;
          w.close();
          watchers.delete(key);
        }
        for (const [key, t] of wanted) {
          if (watchers.has(key)) continue;
          try {
            const w = watchFolder(t.path, { persistent: false }, (_type, name) => {
              // Windows names a deleted folder itself, absolute; an event without a name can't be ruled out.
              if (name && !isAbsolute(name) && t.names && !t.names.includes(basename(name))) return;
              if (name && isAbsolute(name)) {
                w.close();
                if (watchers.get(key) === w) watchers.delete(key);
              }
              trigger();
            });
            w.on("error", () => {
              w.close();
              if (watchers.get(key) === w) watchers.delete(key);
              trigger();
            });
            watchers.set(key, w);
          } catch {
            // Not there yet: its parent is watched, and the next read tries again.
          }
        }
      };

      const read = async (): Promise<RoleList> => {
        const list = await roles.read(dir);
        if (!closed) rewatch();
        return list;
      };

      const refresh = () => {
        queue = queue.then(async () => {
          if (closed) return;
          try {
            const list = await read();
            const json = JSON.stringify(list);
            if (closed || json === last) return;
            last = json;
            listener(list);
          } catch (e) {
            log(`roles read failed: ${errorMessage(e)}`);
          }
        });
      };

      function trigger() {
        if (closed) return;
        clearTimeout(timer);
        timer = setTimeout(refresh, SETTLE_MS);
      }

      const first = await read();
      last = JSON.stringify(first);
      return {
        list: first,
        stop() {
          closed = true;
          clearTimeout(timer);
          for (const w of watchers.values()) w.close();
          watchers.clear();
        },
      };
    },
  };
}
