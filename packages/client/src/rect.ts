/** Rectangles read from the page or the host (STORY-74, STORY-75). */
import { isRecord } from "@featra/work-format/guards";

const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A rectangle in the window's CSS px. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A rect read defensively; null when a side isn't a finite number, or its size is negative. */
export function rectOf(raw: unknown): Rect | null {
  if (!isRecord(raw)) return null;
  const x = finite(raw.x);
  const y = finite(raw.y);
  const width = finite(raw.width);
  const height = finite(raw.height);
  if (x === null || y === null || width === null || height === null || width < 0 || height < 0) return null;
  return { x, y, width, height };
}
