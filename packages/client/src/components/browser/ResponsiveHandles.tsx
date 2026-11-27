import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { BROWSER_COPY, type Rect } from "../../browser.ts";
import { VIEWPORT, clampViewport, type Size } from "../../browser-devices.ts";

type Axis = "x" | "y" | "xy";

/** One arrow key press on a handle, in CSS px of the page; with Shift, ten. */
const STEP = 10;

export interface ResponsiveHandlesProps {
  /** Where the device shows in the viewport, and its scale. */
  frame: Rect & { scale: number };
  gutter: number;
  /** Responsive's size now. */
  size: Size;
  /** Called while dragging. */
  onMove: (size: Size) => void;
  /** Called with the size to keep, at the end of a drag or on a key. */
  onChoose: (size: Size) => void;
}

/**
 * Responsive's drag handles (STORY-74), as Chrome's: the right edge sets the width, the bottom edge the height, the
 * corner both. The device stays centred, so the right edge moves half as far as the width grows. Each is also a
 * separator the keyboard moves with the arrow keys.
 */
export function ResponsiveHandles({ frame, gutter, size, onMove, onChoose }: ResponsiveHandlesProps) {
  const drag = useRef<{ axis: Axis; x: number; y: number; from: Size; now: Size } | null>(null);
  const sized = (axis: Axis, from: Size, dx: number, dy: number): Size => ({
    width: axis === "y" ? from.width : clampViewport(from.width + dx),
    height: axis === "x" ? from.height : clampViewport(from.height + dy),
  });
  const down = (axis: Axis) => (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { axis, x: e.clientX, y: e.clientY, from: size, now: size };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const scale = frame.scale || 1;
    d.now = sized(d.axis, d.from, (2 * (e.clientX - d.x)) / scale, (e.clientY - d.y) / scale);
    onMove(d.now);
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (d) onChoose(d.now);
  };
  const key = (axis: "x" | "y") => (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? STEP * 10 : STEP;
    const delta = { ArrowRight: step, ArrowDown: step, ArrowLeft: -step, ArrowUp: -step }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    onChoose(sized(axis, size, delta, delta));
  };
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const handle = (axis: Axis, style: CSSProperties) => {
    const label = axis === "x" ? BROWSER_COPY.resizeWidth : axis === "y" ? BROWSER_COPY.resizeHeight : undefined;
    const value = axis === "y" ? size.height : size.width;
    return (
      <div
        className={`browser-handle browser-handle-${axis}`}
        style={style}
        {...(label
          ? {
              role: "separator",
              tabIndex: 0,
              "aria-label": label,
              "aria-orientation": axis === "x" ? ("vertical" as const) : ("horizontal" as const),
              "aria-valuenow": value,
              "aria-valuemin": VIEWPORT.min,
              "aria-valuemax": VIEWPORT.max,
              onKeyDown: key(axis === "x" ? "x" : "y"),
            }
          : { "aria-hidden": true })}
        onPointerDown={down(axis)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
    );
  };
  return (
    <>
      {handle("x", { left: right, top: frame.y, width: gutter, height: frame.height })}
      {handle("y", { left: frame.x, top: bottom, width: frame.width, height: gutter })}
      {handle("xy", { left: right, top: bottom, width: gutter, height: gutter })}
    </>
  );
}
