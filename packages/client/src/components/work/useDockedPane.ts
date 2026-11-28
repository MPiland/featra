import { useRef, useState } from "react";
import { paneWidthFor } from "../../pane-width.ts";
import { useMeasuredWidth, type ChosenWidth } from "./PaneHandle.tsx";

/**
 * The width of a card pane docked beside what shares its area (the Work list, or a chat): the user's chosen width
 * fitted to the area (`pane-width.ts`), held while the handle is dragged and chosen when the drag ends. Put `splitRef`
 * on the element that holds both. `reserve` is what a Browser pane docked beside it takes of the area (STORY-74).
 */
export function useDockedPane(paneWidth: ChosenWidth, reserve: (split: number) => number = () => 0) {
  const splitRef = useRef<HTMLDivElement>(null);
  const split = useMeasuredWidth(splitRef);
  // The width while the handle is dragged; kept in the UI state when the drag ends.
  const [dragged, setDragged] = useState<number | null>(null);
  const width = paneWidthFor(dragged ?? paneWidth.chosen, split - reserve(split));
  const choose = (w: number) => {
    setDragged(null);
    paneWidth.choose(w);
  };
  // The card pane's handle sees the area the card pane shares with the list.
  return { splitRef, split, cardSplit: split - reserve(split), width, onMove: setDragged, choose };
}
