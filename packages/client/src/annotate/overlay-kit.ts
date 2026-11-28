/**
 * The Annotate overlay's look and geometry (STORY-75, ADR 0048), apart from its behavior (overlay.ts). Like the overlay
 * it runs in the page, so `overlayKit` is self-contained: the main process injects its source with the overlay's.
 */
/* oxlint-disable unicorn/consistent-function-scoping -- The function runs in the page, so its helpers must be inside it rather than at module scope. */
import type { Rect } from "../rect.ts";

/** The badge's size, and its gap from the box it numbers, in CSS px. */
const BADGE = 22;

export const OVERLAY_CSS = [
  ".glass{position:fixed;inset:0;cursor:crosshair;pointer-events:auto;display:none}",
  ".on .glass{display:block}",
  ".hover,.drag,.outline{position:fixed;box-sizing:border-box;pointer-events:none;display:none;border-radius:3px}",
  ".hover{border:2px solid #3b5fcc;background:rgba(59,95,204,.14)}",
  ".drag{border:2px dashed #3b5fcc;background:rgba(59,95,204,.1)}",
  ".outline{border:2px dashed rgba(59,95,204,.8)}",
  ".outline.active{border:2px solid #3b5fcc;background:rgba(59,95,204,.08)}",
  `.mark{position:fixed;display:none;box-sizing:border-box;min-width:${BADGE}px;height:${BADGE}px;padding:0 6px;`,
  "border:2px solid #fff;border-radius:11px;background:#3b5fcc;color:#fff;font:600 12px/18px system-ui,sans-serif;",
  "text-align:center;cursor:pointer;pointer-events:auto;box-shadow:0 1px 4px rgba(0,0,0,.35)}",
  ".mark.active{background:#1f3fa0}",
  ".hidden .hover,.hidden .drag,.hidden .outline,.hidden .mark{visibility:hidden}",
].join("");

export function overlayKit() {
  const SIZE = 22;
  const GAP = 2;
  const rectOf = (r: DOMRect | Rect): Rect => ({ x: r.x, y: r.y, width: r.width, height: r.height });
  return {
    rectOf,
    union: (rs: Rect[]): Rect | null => {
      if (!rs.length) return null;
      const x = Math.min(...rs.map((r) => r.x));
      const y = Math.min(...rs.map((r) => r.y));
      const right = Math.max(...rs.map((r) => r.x + r.width));
      const bottom = Math.max(...rs.map((r) => r.y + r.height));
      return { x, y, width: right - x, height: bottom - y };
    },
    /** Shows `el` at `r`, or hides it. */
    place: (el: HTMLElement, r: Rect | null) => {
      if (r)
        Object.assign(el.style, {
          display: "block",
          left: `${r.x}px`,
          top: `${r.y}px`,
          width: `${r.width}px`,
          height: `${r.height}px`,
        });
      else el.style.display = "none";
    },
    /**
     * Where a badge goes for box `r` in a viewport of `w` by `h`: just above its top left corner, or just below its
     * bottom left corner when there is no room above, so it covers none of the box; kept in view.
     */
    badgeAt: (r: Rect, w: number, h: number) => {
      const above = r.y - SIZE - GAP;
      const top = above >= 0 ? above : Math.min(h - SIZE, r.y + r.height + GAP);
      return { left: Math.max(0, Math.min(w - SIZE, r.x)), top: Math.max(0, top) };
    },
    /** The part of the element `el` holds the rect `r`, from `el` up: the smallest element around the whole rect. */
    holderOf: (el: Element | null, r: Rect): Element | null => {
      let holder = el;
      while (holder && holder.parentElement) {
        const b = holder.getBoundingClientRect();
        if (b.left <= r.x && b.top <= r.y && b.right >= r.x + r.width && b.bottom >= r.y + r.height) break;
        holder = holder.parentElement;
      }
      return holder;
    },
  };
}

export type OverlayKit = ReturnType<typeof overlayKit>;
