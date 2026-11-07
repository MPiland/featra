import { useEffect, useState } from "react";
import type { WorkBridge, WorkUpdate } from "../../work-list.ts";

/** The live Work list of `dir`: null until the first answer. Watches while mounted; stops on unmount or a new dir. */
export function useWorkList(work: WorkBridge, dir: string): WorkUpdate | null {
  const [update, setUpdate] = useState<{ dir: string; update: WorkUpdate } | null>(null);
  useEffect(() => {
    let live = true;
    const stop = work.watch(dir, (u) => live && setUpdate({ dir, update: u }));
    return () => {
      live = false;
      stop();
    };
  }, [work, dir]);
  return update?.dir === dir ? update.update : null;
}
