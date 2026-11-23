import { useEffect, useState } from "react";
import type { ReviewBridge, ReviewUpdate } from "../../review-screen.ts";

const LOADING: ReviewUpdate = { review: null, loading: true, error: null };

/** Feature `id`'s review in `dir`, live from the server while mounted (STORY-69). */
export function useReview(work: ReviewBridge, dir: string, id: string): ReviewUpdate {
  const [state, setState] = useState<{ key: string; update: ReviewUpdate }>({ key: "", update: LOADING });
  const key = `${dir}\n${id}`;
  useEffect(() => {
    let live = true;
    const stop = work.watchReview(dir, id, (update) => live && setState({ key, update }));
    return () => {
      live = false;
      stop();
    };
  }, [work, dir, id, key]);
  return state.key === key ? state.update : LOADING;
}
