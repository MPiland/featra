/**
 * The overlay's reports, read in the main process (STORY-75, ADR 0048). The overlay runs in the page's renderer, which
 * runs the page's untrusted code, so a report is checked as anything from the page is: it must parse, be one of the
 * known kinds, and its text is cut to size. What doesn't is dropped.
 */
import { isRecord } from "@featra/work-format/guards";
import { readElement, type PickedElement } from "../annotations.ts";
import { rectOf, type Rect } from "../rect.ts";
import type { PageViewport } from "./overlay.ts";

/** The most a report may be, as JSON. */
export const MAX_MESSAGE = 64 * 1024;

export type OverlayReport =
  | { type: "ready" }
  | { type: "open"; id: string }
  | { type: "pick"; ref: number; add: boolean; element: PickedElement; rect: Rect; viewport: PageViewport }
  | {
      type: "region";
      rect: Rect;
      scroll: { x: number; y: number };
      ref: number | null;
      element: PickedElement | null;
      viewport: PageViewport;
    };

const count = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null);
const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function viewportOf(raw: unknown): PageViewport | null {
  if (!isRecord(raw)) return null;
  const width = finite(raw.width);
  const height = finite(raw.height);
  const dpr = finite(raw.dpr);
  return width && height && width > 0 && height > 0 ? { width, height, dpr: dpr && dpr > 0 ? dpr : 1 } : null;
}

export function readOverlayMessage(json: unknown): OverlayReport | null {
  if (typeof json !== "string" || json.length > MAX_MESSAGE) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  if (raw.type === "ready") return { type: "ready" };
  if (raw.type === "open")
    return typeof raw.id === "string" && raw.id.length <= 100 ? { type: "open", id: raw.id } : null;
  const rect = rectOf(raw.rect);
  const viewport = viewportOf(raw.viewport);
  if (!rect || !viewport) return null;
  if (raw.type === "pick") {
    const ref = count(raw.ref);
    const element = readElement(raw.element);
    return ref && element ? { type: "pick", ref, add: raw.add === true, element, rect, viewport } : null;
  }
  if (raw.type === "region") {
    const s = isRecord(raw.scroll) ? raw.scroll : {};
    const scroll = { x: finite(s.x) ?? 0, y: finite(s.y) ?? 0 };
    const element = readElement(raw.element);
    const ref = element ? count(raw.ref) : null;
    return { type: "region", rect, scroll, ref, element: ref ? element : null, viewport };
  }
  return null;
}
