import { useRef, useState } from "react";
import { paneWidthFor } from "../../pane-width.ts";
import { useMeasuredWidth, type ChosenWidth } from "./PaneHandle.tsx";

/**
 * The width of a card pane docked beside what shares its area (the Work list, or a chat): the user's chosen width
 * fitted to the area (`pane-width.ts`), held while the handle is dragged and chosen when the drag ends. Put `splitRef`
 * on the element that holds both.
 */
export function useDockedPane(paneWidth: ChosenWidth) {
  const splitRef = useRef<HTMLDivElement>(null);
  const split = useMeasuredWidth(splitRef);
  // The width while the handle is dragged; kept in the UI state when the drag ends.
  const [dragged, setDragged] = useState<number | null>(null);
  const width = paneWidthFor(dragged ?? paneWidth.chosen, split);
  const choose = (w: number) => {
    setDragged(null);
    paneWidth.choose(w);
  };
  return { splitRef, split, width, onMove: setDragged, choose };
}
