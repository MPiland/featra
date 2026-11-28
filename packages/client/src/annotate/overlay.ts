/**
 * The Annotate overlay (STORY-75, ADR 0048): drawn in the Browser pane's page, in an isolated world of Featra's own
 * (the page's scripts can't see its variables, and its elements are in a closed shadow root). In Annotate mode a glass
 * over the page highlights the element under the pointer; a click picks it, Shift-click adds it to the annotation open
 * on this page, and a drag draws a region. Numbered markers stay on their elements or regions as the page scrolls,
 * resizes or changes its route, and clicking one opens its annotation. It only reports what the user did, as JSON
 * through Featra's binding (which only this world has); the main process decides what becomes an annotation.
 *
 * `installOverlay` is self-contained: the main process injects its source (`overlaySource`), with its look and geometry
 * (overlay-kit.ts), so nothing outside the function is in scope where it runs. Its events are the user's only: synthetic
 * ones (`isTrusted` false) are ignored. A new document runs it before its root element exists; it shows once it does.
 */
/* oxlint-disable unicorn/consistent-function-scoping -- The function runs in the page, so its helpers must be inside it rather than at module scope. */
import type { Rect } from "../rect.ts";
import { describeElement, type Described } from "./describe.ts";
import { OVERLAY_CSS, overlayKit, type OverlayKit } from "./overlay-kit.ts";

/** A marker as the main process gives it: its annotation, number, elements (by ref, then selector) or region. */
export interface Marker {
  id: string;
  n: number;
  refs: number[];
  selectors: string[];
  /** The region, in the page's CSS px from the document's top left; null for elements. */
  region: Rect | null;
  /** The page it was made on, without its hash: its region, or its elements found again by selector, show only there. */
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
  /** Takes the overlay off the page: Annotate is off and no marker is left. */
  remove: () => void;
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
  css = "",
  kit: OverlayKit = overlayKit(),
): void {
  // Its global, by name: `OVERLAY_GLOBAL` is not in scope in the page.
  const GLOBAL = "__featraOverlay";
  // How long a marker's missing element goes unlooked for, in ms.
  const RETRY_MS = 250;
  if (Reflect.has(globalThis, GLOBAL) || window !== window.top) return;
  const doc = document;
  const { rectOf, union, place, badgeAt, holderOf } = kit;
  const make = (tag: string, cls: string, parent: Node) => {
    const el = doc.createElement(tag);
    el.className = cls;
    parent.appendChild(el);
    return el;
  };
  const host = doc.createElement("featra-annotate");
  host.setAttribute("style", "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block");
  const root = host.attachShadow({ mode: "closed" });
  make("style", "", root).textContent = css;
  const frame = make("div", "", root);
  const glass = make("div", "glass", frame);
  const hover = make("div", "hover", frame);
  const drag = make("div", "drag", frame);
  const marks = make("div", "marks", frame);

  let removed = false;
  /** Puts the overlay on the page; false while the document has no root element yet. */
  const mount = () => {
    if (removed || host.isConnected) return true;
    const at = doc.documentElement;
    if (!at) return false;
    at.appendChild(host);
    return true;
  };
  if (!mount()) {
    const waiting = new MutationObserver(() => {
      if (mount()) waiting.disconnect();
    });
    waiting.observe(doc, { childList: true });
  }

  const refs = new Map<number, Element>();
  let nextRef = 1;
  let markers: Marker[] = [];
  const drawn = new Map<string, { badge: HTMLElement; outlines: HTMLElement[] }>();
  const found = new Map<string, Element>();
  // When a marker's element was last looked for and not found, by key.
  const missed = new Map<string, number>();
  let start: { x: number; y: number } | null = null;
  let dragging = false;
  let loop = 0;

  const here = () => location.href.split("#")[0];
  const viewport = () => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio });
  const elementAt = (x: number, y: number) =>
    doc.elementsFromPoint(x, y).find((e) => e !== host && !host.contains(e)) ?? null;
  /** Finds a marker's element again by its selector; not more than every `RETRY_MS` while it is missing. */
  const lookFor = (key: string, selector: string | undefined) => {
    const known = found.get(key);
    if (known && known.isConnected) return known;
    const last = missed.get(key);
    if (last !== undefined && performance.now() - last < RETRY_MS) return null;
    let again: Element | null = null;
    try {
      again = selector ? doc.querySelector(selector) : null;
    } catch {
      again = null;
    }
    if (again) {
      found.set(key, again);
      missed.delete(key);
    } else missed.set(key, performance.now());
    return again;
  };
  /** A marker's elements, now: by ref while connected, else found again by selector on its own page. */
  const elementsOf = (m: Marker) =>
    m.refs
      .map((ref, i) => {
        const el = refs.get(ref);
        if (el && el.isConnected) return el;
        return m.url === here() ? lookFor(`${m.id}:${i}`, m.selectors[i]) : null;
      })
      .filter((e): e is Element => e !== null);
  /** The boxes a marker outlines now, in the viewport: its region, or each of its elements. */
  const boxesOf = (m: Marker): Rect[] => {
    if (m.region) return m.url === here() ? [{ ...m.region, x: m.region.x - scrollX, y: m.region.y - scrollY }] : [];
    return elementsOf(m).map((e) => rectOf(e.getBoundingClientRect()));
  };
  const draw = () => {
    mount();
    for (const m of markers) {
      const d = drawn.get(m.id);
      if (!d) continue;
      const boxes = boxesOf(m);
      while (d.outlines.length < boxes.length) d.outlines.push(make("div", "outline", marks));
      d.outlines.forEach((o, i) => {
        place(o, boxes[i] ?? null);
        o.classList.toggle("active", m.active);
      });
      const first = boxes[0];
      d.badge.style.display = first ? "block" : "none";
      if (first) {
        const at = badgeAt(first, innerWidth, innerHeight);
        d.badge.style.left = `${at.left}px`;
        d.badge.style.top = `${at.top}px`;
      }
    }
  };
  const tick = () => {
    draw();
    loop = markers.length && !removed ? requestAnimationFrame(tick) : 0;
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
      const holder = holderOf(elementAt(rect.x + rect.width / 2, rect.y + rect.height / 2), rect);
      const ref = holder ? nextRef++ : null;
      if (holder && ref) refs.set(ref, holder);
      const element = holder ? describe(holder) : null;
      report({ type: "region", rect, scroll: { x: scrollX, y: scrollY }, ref, element, viewport: viewport() });
      return;
    }
    const el = elementAt(e.clientX, e.clientY);
    if (!el) return;
    const ref = nextRef++;
    refs.set(ref, el);
    // Shift adds to the annotation open, when it is of elements on this page.
    const active = markers.find((m) => m.active && !m.region && m.url === here());
    const add = e.shiftKey && active !== undefined;
    const own = rectOf(el.getBoundingClientRect());
    const rect =
      add && active ? (union([own, ...elementsOf(active).map((x) => rectOf(x.getBoundingClientRect()))]) ?? own) : own;
    report({ type: "pick", ref, add, element: describe(el), rect, viewport: viewport() });
  });

  const control: OverlayControl = {
    mode(on: boolean) {
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
        for (const o of d.outlines) o.remove();
        drawn.delete(id);
      }
      for (const m of next) {
        let d = drawn.get(m.id);
        if (!d) {
          const badge = make("div", "mark", marks);
          badge.addEventListener("pointerdown", (e) => {
            if (!trusted(e)) return;
            e.preventDefault();
            e.stopPropagation();
            send(JSON.stringify({ type: "open", id: m.id }));
          });
          d = { badge, outlines: [] };
          drawn.set(m.id, d);
        }
        d.badge.textContent = String(m.n);
        d.badge.classList.toggle("active", m.active);
      }
      draw();
      if (markers.length && !loop) loop = requestAnimationFrame(tick);
    },
    node: (ref: number) => refs.get(ref) ?? null,
    remove() {
      removed = true;
      markers = [];
      if (loop) cancelAnimationFrame(loop);
      loop = 0;
      host.remove();
      Reflect.deleteProperty(globalThis, GLOBAL);
    },
  };
  Reflect.set(globalThis, GLOBAL, control);
  send(JSON.stringify({ type: "ready" }));
}

/** The script the main process injects in the overlay's world: the overlay, with what it needs, reporting by binding. */
export const overlaySource = (): string =>
  `(${installOverlay.toString()})(${describeElement.toString()}, (m) => globalThis[${JSON.stringify(OVERLAY_BINDING)}](m), undefined, ${JSON.stringify(OVERLAY_CSS)}, (${overlayKit.toString()})());`;
