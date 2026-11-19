import { useEffect, useState } from "react";
import { EMPTY_NEEDS, type NeedsList } from "@featra/work-format/project-needs";
import type { NeedsBridge } from "../needs.ts";

/** What every open project needs from the user, as the server last sent it (STORY-66); none while `on` is false. */
export function useProjectNeeds(needs: NeedsBridge, on: boolean): NeedsList {
  const [current, setCurrent] = useState<NeedsList>(EMPTY_NEEDS);
  useEffect(() => {
    if (!on) return undefined;
    let live = true;
    const stop = needs.watch((next) => live && setCurrent(next));
    return () => {
      live = false;
      stop();
    };
  }, [needs, on]);
  return on ? current : EMPTY_NEEDS;
}
