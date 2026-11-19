import { useEffect, useState } from "react";
import { EMPTY_NEEDS, type NeedsList } from "@featra/work-format/project-needs";
import type { NeedsBridge } from "../needs.ts";

/**
 * What every open project needs from the user, as the server last sent it (STORY-66). Watched with or without a current
 * project: with none, every open project is another one.
 */
export function useProjectNeeds(needs: NeedsBridge): NeedsList {
  const [current, setCurrent] = useState<NeedsList>(EMPTY_NEEDS);
  useEffect(() => {
    let live = true;
    const stop = needs.watch((next) => live && setCurrent(next));
    return () => {
      live = false;
      stop();
    };
  }, [needs]);
  return current;
}
