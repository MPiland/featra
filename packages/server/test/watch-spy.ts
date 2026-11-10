/** `fs.watch` that remembers which watchers are still open: what the tests count to prove nothing is left watching. */
import { watch, type FSWatcher } from "node:fs";
import type { WatchFolder } from "../src/work-watch.ts";

export function watchSpy(): { watchFolder: WatchFolder; open: Set<FSWatcher> } {
  const open = new Set<FSWatcher>();
  const watchFolder = ((path: string, options: object, listener: () => void) => {
    const w = watch(path, options, listener);
    open.add(w);
    const close = w.close.bind(w);
    w.close = () => {
      open.delete(w);
      close();
    };
    return w;
  }) as WatchFolder;
  return { watchFolder, open };
}
