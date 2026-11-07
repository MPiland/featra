import { useEffect, useState } from "react";
import type { CardBridge, CardUpdate, CardView } from "../../card-pane.ts";

const LOADING: CardUpdate = { view: null, loading: true, error: null };

/**
 * Card `id` of `dir`, live from its owner copy while mounted. `setView` takes the view an update answered with, so
 * the pane shows the saved card without waiting for the next push.
 */
export function useCard(work: CardBridge, dir: string, id: string) {
  const [state, setState] = useState<{ key: string; update: CardUpdate }>({ key: "", update: LOADING });
  const key = `${dir}\n${id}`;
  useEffect(() => {
    let live = true;
    const stop = work.watchCard(dir, id, (update) => live && setState({ key, update }));
    return () => {
      live = false;
      stop();
    };
  }, [work, dir, id, key]);
  const update = state.key === key ? state.update : LOADING;
  const setView = (view: CardView) => setState({ key, update: { view, loading: false, error: null } });
  return { ...update, setView };
}
