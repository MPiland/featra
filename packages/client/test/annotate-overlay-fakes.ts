/**
 * STORY-75: the overlay's tests' page (annotate-overlay.test.ts, annotate-overlay-markers.test.ts): a real DOM (jsdom)
 * with what jsdom can't do faked: layout (each element's box, `elementsFromPoint`), the frame clock, and the browser's
 * mark on the user's own events.
 */
import { afterEach, beforeEach, vi } from "vitest";
import { describeElement } from "../src/annotate/describe.ts";
import { OVERLAY_GLOBAL, installOverlay, type Marker, type OverlayControl } from "../src/annotate/overlay.ts";

type Box = { x: number; y: number; width: number; height: number };
const boxes = new Map<Element, Box>();
let shadow: ShadowRoot | null = null;
export const sent: unknown[] = [];

/** Lays `el` out at `box`, in the viewport's px. */
export function layout(el: Element, box: Box) {
  boxes.set(el, box);
  el.getBoundingClientRect = () => DOMRect.fromRect(boxes.get(el));
}
const at = (x: number, y: number) =>
  [...boxes.entries()]
    .filter(([el, b]) => el.isConnected && x >= b.x && y >= b.y && x <= b.x + b.width && y <= b.y + b.height)
    .map(([el]) => el)
    .toReversed();

export const control = () => Reflect.get(globalThis, OVERLAY_GLOBAL) as OverlayControl;
export const part = (cls: string) => shadow!.querySelector<HTMLElement>(`.${cls}`)!;
export const parts = (cls: string) => [...shadow!.querySelectorAll<HTMLElement>(`.${cls}`)];
export const marks = () => parts("mark");
export const glass = () => part("glass");
export const mouse = (type: string, x: number, y: number, extra: MouseEventInit = {}) =>
  glass().dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, ...extra }));
export const click = (x: number, y: number, extra: MouseEventInit = {}) => {
  mouse("pointerdown", x, y, extra);
  mouse("pointerup", x, y, extra);
};
/** Frames: the overlay hides itself for two before it reports, so the screenshot shows only the page. */
export const frames = (n = 2) => {
  for (let i = 0; i < n; i++) vi.advanceTimersToNextFrame();
};
export const reports = () => sent.map((s) => JSON.parse(String(s)) as Record<string, unknown>);
export const clearSent = () => void sent.splice(0);
export const scrollTo = (y: number) => Object.defineProperty(window, "scrollY", { value: y, configurable: true });

const send = (m: string) => void sent.push(m);
/** Installs the overlay, with every event taken as the user's unless `untrusted`: jsdom can't mark them so. */
export function install(untrusted = false) {
  if (untrusted) installOverlay(describeElement, send);
  else installOverlay(describeElement, send, () => true);
}

export const marker = (over: Partial<Marker> = {}): Marker => ({
  id: "a1",
  n: 1,
  refs: [1],
  selectors: ["#buy"],
  region: null,
  url: `${location.origin}/plans`,
  active: false,
  ...over,
});

/** Each test's page: a heading, a lead paragraph and a button, laid out; the overlay gone after. */
export function fakePageEachTest() {
  beforeEach(() => {
    vi.useFakeTimers();
    clearSent();
    shadow = null;
    const attach = Object.getOwnPropertyDescriptor(Element.prototype, "attachShadow")?.value as (
      this: Element,
      init: ShadowRootInit,
    ) => ShadowRoot;
    vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (this: Element, init) {
      shadow = attach.call(this, init);
      return shadow;
    });
    document.elementsFromPoint = (x: number, y: number) => at(x, y);
    document.body.innerHTML = `<main><h1 id="title">Plans</h1><p id="lead">Pick one.</p><button id="buy">Buy</button></main>`;
    layout(document.querySelector("main")!, { x: 0, y: 0, width: 800, height: 600 });
    layout(document.getElementById("title")!, { x: 10, y: 10, width: 300, height: 40 });
    layout(document.getElementById("lead")!, { x: 10, y: 60, width: 300, height: 20 });
    layout(document.getElementById("buy")!, { x: 10, y: 100, width: 80, height: 30 });
    history.replaceState(null, "", "/plans");
    scrollTo(0);
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, OVERLAY_GLOBAL);
    document.documentElement.querySelector("featra-annotate")?.remove();
    boxes.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
}
