import { useEffect, useState } from "react";
import type { WorkBridge, WorkUpdate } from "../../work-list.ts";

/** The live Work list of `dir`: null until the first answer, and when `dir` is null (nothing to watch). Watches while mounted; stops on unmount or a new dir. */
export function useWorkList(work: WorkBridge, dir: string | null): WorkUpdate | null {
  const [update, setUpdate] = useState<{ dir: string; update: WorkUpdate } | null>(null);
  useEffect(() => {
    if (dir === null) return undefined;
    let live = true;
    const stop = work.watch(dir, (u) => live && setUpdate({ dir, update: u }));
    return () => {
      live = false;
      stop();
    };
  }, [work, dir]);
  return update?.dir === dir ? update.update : null;
}
