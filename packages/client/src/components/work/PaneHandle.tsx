import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { CARD_COPY } from "../../card-pane.ts";
import { paneLimits, paneWidthFor, stepPaneWidth } from "../../pane-width.ts";

/** The pane width the user chose (null: the default), kept in the UI state, and how to change it. */
export interface ChosenWidth {
  chosen: number | null;
  choose: (width: number) => void;
}

/** The width of `ref`'s element, kept current; 0 until measured (and where there is no layout). */
export function useMeasuredWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    const observer =
      el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => setWidth(el.clientWidth)) : null;
    if (el) observer?.observe(el);
    return () => observer?.disconnect();
  }, [ref]);
  return width;
}

interface PaneHandleProps {
  /** The pane's width now. */
  width: number;
  /** The work area's width, which the pane and the list share. */
  split: number;
  paneId: string;
  /** Called while dragging. */
  onMove: (width: number) => void;
  /** Called with the width to keep, at the end of a drag or on a key. */
  onChoose: (width: number) => void;
  onClose: () => void;
}

/**
 * The card pane's left edge: drag it, or focus it and use Left and Right (Home and End for the limits). Escape
 * closes the pane, as it does from inside it.
 */
export function PaneHandle({ width, split, paneId, onMove, onChoose, onClose }: PaneHandleProps) {
  const drag = useRef<{ x: number; width: number; now: number } | null>(null);
  const { min, max } = paneLimits(split);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width, now: width };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // The pane is on the right: moving the edge left widens it.
    d.now = paneWidthFor(d.width + d.x - e.clientX, split);
    onMove(d.now);
  };
  const onPointerEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (d) onChoose(d.now);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    const next = stepPaneWidth(width, e.key, split);
    if (next === null) return;
    e.preventDefault();
    onChoose(next);
  };

  return (
    <div
      role="separator"
      className="pane-handle"
      aria-label={CARD_COPY.resize}
      aria-orientation="vertical"
      aria-controls={paneId}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
    />
  );
}
