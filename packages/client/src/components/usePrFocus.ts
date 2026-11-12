import { useEffect } from "react";
import type { WorkBridge } from "../work-list.ts";

/** Open PRs are read again soon after the window regains focus (STORY-11); the server settles a burst into one read. */
export function usePrFocus(work: Pick<WorkBridge, "refreshPrs">) {
  useEffect(() => {
    const focused = () => work.refreshPrs();
    window.addEventListener("focus", focused);
    return () => window.removeEventListener("focus", focused);
  }, [work]);
}
