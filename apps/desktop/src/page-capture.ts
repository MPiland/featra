import type { Rect } from "@featra/client/bridge";
import { isRecord } from "@featra/work-format/guards";

/**
 * An annotation's screenshot (STORY-75, ADR 0048), taken by the page's renderer over the DevTools Protocol: the clip is
 * in the document's CSS px, so the device shown, its scale, the window's zoom and the page's own zoom or pinch all
 * come out right, where a capture of the view in its own pixels would have to guess each of them.
 */

/** What a capture needs of `webContents.debugger`. */
export interface CaptureCdp {
  sendCommand: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
}

/** How long a screenshot may take. */
export const CAPTURE_MS = 5000;

const record = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});
const num = (v: unknown, or = 0) => (typeof v === "number" && Number.isFinite(v) ? v : or);

/** `rect` within the viewport, whole pixels; null when none of it is in view. */
export function inView(rect: Rect, viewport: { width: number; height: number }): Rect | null {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(viewport.width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(viewport.height, Math.ceil(rect.y + rect.height));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

/**
 * A PNG data URL of `rect` of the page, given in the layout viewport's CSS px (as the page's own `getBoundingClientRect`
 * gives it), cut to what the user sees of the page (the visual viewport, when pinched); null when none of it shows or
 * the page gives none.
 */
export async function captureClip(dbg: CaptureCdp, rect: Rect): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The page didn't answer in time.")), CAPTURE_MS);
  });
  const take = async () => {
    const metrics = record(await dbg.sendCommand("Page.getLayoutMetrics"));
    const layout = record(metrics.cssLayoutViewport);
    const visual = record(metrics.cssVisualViewport);
    // From the layout viewport to the document, then cut to the visual viewport, all in the document.
    const doc = { ...rect, x: rect.x + num(layout.pageX), y: rect.y + num(layout.pageY) };
    const seen = {
      x: num(visual.pageX),
      y: num(visual.pageY),
      width: num(visual.clientWidth, Infinity),
      height: num(visual.clientHeight, Infinity),
    };
    const shown = inView({ ...doc, x: doc.x - seen.x, y: doc.y - seen.y }, seen);
    if (!shown) return null;
    const shot = record(
      await dbg.sendCommand("Page.captureScreenshot", {
        format: "png",
        clip: { x: shown.x + seen.x, y: shown.y + seen.y, width: shown.width, height: shown.height, scale: 1 },
      }),
    );
    return typeof shot.data === "string" && shot.data ? `data:image/png;base64,${shot.data}` : null;
  };
  try {
    return await Promise.race([take(), late]);
  } finally {
    clearTimeout(timer);
  }
}
