/**
 * The Annotate overlay (STORY-75, ADR 0048): drawn in the Browser pane's page, in an isolated world of Featra's own
 * (the page's scripts can't see its variables, and its elements are in a closed shadow root). In Annotate mode a glass
 * over the page highlights the element under the pointer; a click picks it, Shift-click adds it to the open annotation,
 * and a drag draws a region. Numbered markers stay on their elements or regions as the page scrolls, resizes or changes
 * its route, and clicking one opens its annotation. It only reports what the user did, as JSON through Featra's binding
 * (which only this world has); the main process decides what becomes an annotation.
 *
 * `installOverlay` is self-contained: the main process injects its source (`overlaySource`), so nothing outside the
 * function is in scope where it runs. Its events are the user's only: synthetic ones (`isTrusted` false) are ignored.
 */
/* oxlint-disable unicorn/consistent-function-scoping -- The function runs in the page, so its helpers must be inside it rather than at module scope. */
import type { Rect } from "../rect.ts";
import { describeElement, type Described } from "./describe.ts";

/** A marker as the main process gives it: its annotation, number, elements (by ref, then selector) or region. */
export interface Marker {
  id: string;
  n: number;
  refs: number[];
  selectors: string[];
  /** The region, in the page's CSS px from the document's top left; null for elements. */
  region: Rect | null;
  /** The page it was made on, without its hash: a region, or an element found again by selector, shows only there. */
  url: string;
  active: boolean;
}

/** What the overlay reports, as JSON. Rects are in the viewport's CSS px. */
export type OverlayMessage =
  | { type: "ready" }
  | { type: "open"; id: string }
  | { type: "pick"; ref: number; add: boolean; element: Described; rect: Rect; viewport: PageViewport }
  | {
      type: "region";
      rect: Rect;
      scroll: { x: number; y: number };
      ref: number | null;
      element: Described | null;
      viewport: PageViewport;
    };

export interface PageViewport {
  width: number;
  height: number;
  dpr: number;
}

/** What the main process calls in the overlay's world. */
export interface OverlayControl {
  mode: (on: boolean) => void;
  sync: (markers: Marker[]) => void;
  node: (ref: number) => Element | null;
}

/** The name of the world and of its binding. */
export const OVERLAY_WORLD = "featra-annotate";
export const OVERLAY_BINDING = "__featraAnnotate";
export const OVERLAY_GLOBAL = "__featraOverlay";

/**
 * Installs the overlay in this world of the page. `trusted` says whether an event is the user's: the browser's own mark
 * (`isTrusted`) where it runs; a test's stand-in for that mark where none can be made.
 */
export function installOverlay(
  describe: (el: Element) => Described,
  send: (json: string) => void,
  trusted: (e: Event) => boolean = (e) => e.isTrusted,
): void {
  // Its global, by name: `OVERLAY_GLOBAL` is not in scope in the page.
  const GLOBAL = "__featraOverlay";
  if (Reflect.has(globalThis, GLOBAL) || window !== window.top) return;
  const doc = document;
  const make = (tag: string, cls: string, parent: Node) => {
    const el = doc.createElement(tag);
    el.className = cls;
    parent.appendChild(el);
    return el;
  };
  const host = doc.createElement("featra-annotate");
  host.setAttribute("style", "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block");
  const root = host.attachShadow({ mode: "closed" });
  make("style", "", root).textContent = [
    ".glass{position:fixed;inset:0;cursor:crosshair;pointer-events:auto;display:none}",
    ".on .glass{display:block}",
    ".hover,.drag,.outline{position:fixed;box-sizing:border-box;pointer-events:none;display:none;border-radius:3px}",
    ".hover{border:2px solid #3b5fcc;background:rgba(59,95,204,.14)}",
    ".drag{border:2px dashed #3b5fcc;background:rgba(59,95,204,.1)}",
    ".outline{border:2px dashed rgba(59,95,204,.8)}",
    ".outline.active{border:2px solid #3b5fcc;background:rgba(59,95,204,.08)}",
    ".mark{position:fixed;display:none;box-sizing:border-box;min-width:22px;height:22px;padding:0 6px;border:2px solid #fff;",
    "border-radius:11px;background:#3b5fcc;color:#fff;font:600 12px/18px system-ui,sans-serif;text-align:center;",
    "cursor:pointer;pointer-events:auto;transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(0,0,0,.35)}",
    ".mark.active{background:#1f3fa0}",
    ".hidden .hover,.hidden .drag,.hidden .outline,.hidden .mark{visibility:hidden}",
  ].join("");
  const frame = make("div", "", root);
  const glass = make("div", "glass", frame);
  const hover = make("div", "hover", frame);
  const drag = make("div", "drag", frame);
  const marks = make("div", "marks", frame);
  doc.documentElement.appendChild(host);

  const refs = new Map<number, Element>();
  let nextRef = 1;
  let markers: Marker[] = [];
  const drawn = new Map<string, { badge: HTMLElement; outline: HTMLElement }>();
  const found = new Map<string, Element>();
  let on = false;
  let start: { x: number; y: number } | null = null;
  let dragging = false;
  let loop = 0;

  const here = () => location.href.split("#")[0];
  const rectOf = (r: DOMRect | Rect): Rect => ({ x: r.x, y: r.y, width: r.width, height: r.height });
  const union = (rs: Rect[]): Rect | null => {
    if (!rs.length) return null;
    const x = Math.min(...rs.map((r) => r.x));
    const y = Math.min(...rs.map((r) => r.y));
    const right = Math.max(...rs.map((r) => r.x + r.width));
    const bottom = Math.max(...rs.map((r) => r.y + r.height));
    return { x, y, width: right - x, height: bottom - y };
  };
  const place = (el: HTMLElement, r: Rect | null) => {
    if (r)
      Object.assign(el.style, {
        display: "block",
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
    else el.style.display = "none";
  };
  const viewport = () => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio });
  const elementAt = (x: number, y: number) =>
    doc.elementsFromPoint(x, y).find((e) => e !== host && !host.contains(e)) ?? null;
  /** A marker's elements, now: by ref while connected, else found again by selector on its own page. */
  const elementsOf = (m: Marker) =>
    m.refs
      .map((ref, i) => {
        const el = refs.get(ref);
        if (el && el.isConnected) return el;
        if (m.url !== here()) return null;
        const key = `${m.id}:${i}`;
        const known = found.get(key);
        if (known && known.isConnected) return known;
        let again: Element | null = null;
        const selector = m.selectors[i];
        try {
          again = selector ? doc.querySelector(selector) : null;
        } catch {
          again = null;
        }
        if (again) found.set(key, again);
        return again;
      })
      .filter((e): e is Element => e !== null);
  const areaOf = (m: Marker): Rect | null => {
    if (m.region) return m.url === here() ? { ...m.region, x: m.region.x - scrollX, y: m.region.y - scrollY } : null;
    return union(elementsOf(m).map((e) => rectOf(e.getBoundingClientRect())));
  };
  const draw = () => {
    if (!host.isConnected) doc.documentElement.appendChild(host);
    for (const m of markers) {
      const d = drawn.get(m.id);
      if (!d) continue;
      const area = areaOf(m);
      place(d.outline, area);
      d.badge.style.display = area ? "block" : "none";
      if (area) {
        d.badge.style.left = `${Math.min(innerWidth - 12, Math.max(12, area.x))}px`;
        d.badge.style.top = `${Math.min(innerHeight - 12, Math.max(12, area.y))}px`;
      }
    }
  };
  const tick = () => {
    draw();
    loop = markers.length ? requestAnimationFrame(tick) : 0;
  };
  /** Hides the overlay's own drawing, lets the page paint, then reports: the screenshot shows the page alone. */
  const report = (message: OverlayMessage) => {
    frame.classList.add("hidden");
    requestAnimationFrame(() => requestAnimationFrame(() => send(JSON.stringify(message))));
    setTimeout(() => frame.classList.remove("hidden"), 3000);
  };

  glass.addEventListener("pointermove", (e) => {
    if (!trusted(e)) return;
    if (start && (dragging || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4)) {
      dragging = true;
      place(hover, null);
      const x = Math.min(start.x, e.clientX);
      const y = Math.min(start.y, e.clientY);
      place(drag, { x, y, width: Math.abs(e.clientX - start.x), height: Math.abs(e.clientY - start.y) });
    } else {
      const el = elementAt(e.clientX, e.clientY);
      place(hover, el ? rectOf(el.getBoundingClientRect()) : null);
    }
  });
  glass.addEventListener("pointerdown", (e) => {
    if (!trusted(e) || e.button !== 0) return;
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY };
    dragging = false;
  });
  glass.addEventListener("pointerup", (e) => {
    if (!trusted(e) || !start) return;
    const from = start;
    start = null;
    place(hover, null);
    place(drag, null);
    if (dragging) {
      dragging = false;
      const rect = {
        x: Math.min(from.x, e.clientX),
        y: Math.min(from.y, e.clientY),
        width: Math.abs(e.clientX - from.x),
        height: Math.abs(e.clientY - from.y),
      };
      const center = elementAt(rect.x + rect.width / 2, rect.y + rect.height / 2);
      let holder: Element | null = center;
      while (holder && holder.parentElement) {
        const b = holder.getBoundingClientRect();
        if (b.left <= rect.x && b.top <= rect.y && b.right >= rect.x + rect.width && b.bottom >= rect.y + rect.height)
          break;
        holder = holder.parentElement;
      }
      const ref = holder ? nextRef++ : null;
      if (holder && ref) refs.set(ref, holder);
      report({
        type: "region",
        rect,
        scroll: { x: scrollX, y: scrollY },
        ref,
        element: holder ? describe(holder) : null,
        viewport: viewport(),
      });
      return;
    }
    const el = elementAt(e.clientX, e.clientY);
    if (!el) return;
    const ref = nextRef++;
    refs.set(ref, el);
    const active = markers.find((m) => m.active && !m.region);
    const add = e.shiftKey && active !== undefined;
    const own = rectOf(el.getBoundingClientRect());
    const rect =
      add && active ? (union([own, ...elementsOf(active).map((x) => rectOf(x.getBoundingClientRect()))]) ?? own) : own;
    report({ type: "pick", ref, add, element: describe(el), rect, viewport: viewport() });
  });

  const control = {
    mode(next: boolean) {
      on = next;
      frame.classList.toggle("on", on);
      if (!on) {
        start = null;
        dragging = false;
        place(hover, null);
        place(drag, null);
      }
    },
    sync(next: Marker[]) {
      markers = next;
      frame.classList.remove("hidden");
      for (const [id, d] of drawn) {
        if (next.some((m) => m.id === id)) continue;
        d.badge.remove();
        d.outline.remove();
        drawn.delete(id);
      }
      for (const m of next) {
        let d = drawn.get(m.id);
        if (!d) {
          const outline = make("div", "outline", marks);
          const badge = make("div", "mark", marks);
          badge.addEventListener("pointerdown", (e) => {
            if (!trusted(e)) return;
            e.preventDefault();
            e.stopPropagation();
            send(JSON.stringify({ type: "open", id: m.id }));
          });
          d = { badge, outline };
          drawn.set(m.id, d);
        }
        d.badge.textContent = String(m.n);
        d.badge.classList.toggle("active", m.active);
        d.outline.classList.toggle("active", m.active);
      }
      draw();
      if (markers.length && !loop) loop = requestAnimationFrame(tick);
    },
    node: (ref: number) => refs.get(ref) ?? null,
  };
  Reflect.set(globalThis, GLOBAL, control);
  send(JSON.stringify({ type: "ready" }));
}

/** The script the main process injects in the overlay's world: the overlay, with what it needs, reporting by binding. */
export const overlaySource = (): string =>
  `(${installOverlay.toString()})(${describeElement.toString()}, (m) => globalThis[${JSON.stringify(OVERLAY_BINDING)}](m));`;
