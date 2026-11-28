/**
 * STORY-75 AC1 and AC4: the Annotate overlay in the page (annotate/overlay.ts), on a real DOM (jsdom). In Annotate mode
 * the element under the pointer is highlighted; a click picks it, Shift-click adds it to the annotation open, a drag
 * draws a region; markers stay on their elements as the page moves them, scrolls or changes its route; clicking one
 * opens its annotation. Fakes only what jsdom can't do: layout (each element's box, `elementsFromPoint`), the frame
 * clock, and the browser's mark on the user's own events.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeElement } from "../src/annotate/describe.ts";
import {
  OVERLAY_GLOBAL,
  installOverlay,
  overlaySource,
  type Marker,
  type OverlayControl,
} from "../src/annotate/overlay.ts";

type Box = { x: number; y: number; width: number; height: number };
const boxes = new Map<Element, Box>();
let shadow: ShadowRoot | null = null;
let sent: unknown[] = [];

/** Lays `el` out at `box`, in the viewport's px. */
function layout(el: Element, box: Box) {
  boxes.set(el, box);
  el.getBoundingClientRect = () => DOMRect.fromRect(boxes.get(el));
}
const at = (x: number, y: number) =>
  [...boxes.entries()]
    .filter(([el, b]) => el.isConnected && x >= b.x && y >= b.y && x <= b.x + b.width && y <= b.y + b.height)
    .map(([el]) => el)
    .toReversed();

const control = () => Reflect.get(globalThis, OVERLAY_GLOBAL) as OverlayControl;
const part = (cls: string) => shadow!.querySelector<HTMLElement>(`.${cls}`)!;
const marks = () => [...shadow!.querySelectorAll<HTMLElement>(".mark")];
const glass = () => part("glass");
const mouse = (type: string, x: number, y: number, extra: MouseEventInit = {}) =>
  glass().dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, ...extra }));
const click = (x: number, y: number, extra: MouseEventInit = {}) => {
  mouse("pointerdown", x, y, extra);
  mouse("pointerup", x, y, extra);
};
/** Two frames: the overlay hides itself for them before it reports, so the screenshot shows only the page. */
const frames = (n = 2) => {
  for (let i = 0; i < n; i++) vi.advanceTimersToNextFrame();
};
const reports = () => sent.map((s) => JSON.parse(String(s)) as Record<string, unknown>);

const send = (m: string) => void sent.push(m);
/** Installs the overlay, with every event taken as the user's unless `untrusted`: jsdom can't mark them so. */
function install(untrusted = false) {
  if (untrusted) installOverlay(describeElement, send);
  else installOverlay(describeElement, send, () => true);
}

beforeEach(() => {
  vi.useFakeTimers();
  sent = [];
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
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, OVERLAY_GLOBAL);
  document.documentElement.querySelector("featra-annotate")?.remove();
  boxes.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const marker = (over: Partial<Marker> = {}): Marker => ({
  id: "a1",
  n: 1,
  refs: [1],
  selectors: ["#buy"],
  region: null,
  url: `${location.origin}/plans`,
  active: false,
  ...over,
});

describe("installing", () => {
  it("says it is ready, once, in a shadow root the page can't open", () => {
    install();
    install();
    expect(reports()).toEqual([{ type: "ready" }]);
    expect(document.querySelector("featra-annotate")!.shadowRoot).toBeNull();
  });

  it("runs from its injected source alone, reporting by the world's binding", () => {
    const binding = vi.fn<(m: string) => void>();
    Reflect.set(globalThis, "__featraAnnotate", binding);
    // oxlint-disable-next-line typescript/no-implied-eval -- the source main injects, run as the page's world runs it.
    new Function(overlaySource())();
    Reflect.deleteProperty(globalThis, "__featraAnnotate");
    expect(binding).toHaveBeenCalledWith(JSON.stringify({ type: "ready" }));
    expect(typeof control().mode).toBe("function");
  });
});

describe("AC1: in Annotate mode", () => {
  it("covers the page only while on", () => {
    install();
    const frame = glass().parentElement!;
    expect(frame.classList.contains("on")).toBe(false);
    control().mode(true);
    expect(frame.classList.contains("on")).toBe(true);
    control().mode(false);
    expect(frame.classList.contains("on")).toBe(false);
  });

  it("highlights the element under the pointer", () => {
    install();
    control().mode(true);
    mouse("pointermove", 20, 110);
    expect(part("hover").style).toMatchObject({
      display: "block",
      left: "10px",
      top: "100px",
      width: "80px",
      height: "30px",
    });
    mouse("pointermove", 20, 20);
    expect(part("hover").style.top).toBe("10px");
  });

  it("picks the element clicked, reporting it after hiding itself for two frames", () => {
    install();
    control().mode(true);
    sent = [];
    click(20, 110);
    expect(sent).toEqual([]);
    expect(glass().parentElement!.classList.contains("hidden")).toBe(true);
    frames();
    expect(reports()).toEqual([
      {
        type: "pick",
        ref: 1,
        add: false,
        element: describeElement(document.getElementById("buy")!),
        rect: { x: 10, y: 100, width: 80, height: 30 },
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      },
    ]);
    expect(control().node(1)).toBe(document.getElementById("buy"));
  });

  it("adds a Shift-clicked element to the annotation open, with the rect of them all", () => {
    install();
    control().mode(true);
    control().sync([marker({ refs: [99], active: true })]);
    sent = [];
    click(20, 20, { shiftKey: true });
    frames();
    expect(reports()[0]).toMatchObject({ type: "pick", add: true, rect: { x: 10, y: 10, width: 300, height: 120 } });
  });

  it("makes a Shift-click with nothing open, or a region open, a pick of its own", () => {
    install();
    control().mode(true);
    click(20, 20, { shiftKey: true });
    frames();
    control().sync([marker({ active: true, region: { x: 0, y: 0, width: 5, height: 5 } })]);
    sent = [];
    click(20, 110, { shiftKey: true });
    frames();
    expect(reports().map((r) => r.add)).toEqual([false]);
  });

  it("draws a region by a drag, in the document, with the element that holds it", () => {
    install();
    control().mode(true);
    Object.defineProperty(window, "scrollY", { value: 300, configurable: true });
    sent = [];
    mouse("pointerdown", 20, 12);
    mouse("pointermove", 200, 40);
    expect(part("drag").style).toMatchObject({
      display: "block",
      left: "20px",
      top: "12px",
      width: "180px",
      height: "28px",
    });
    mouse("pointerup", 200, 40);
    frames();
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    expect(reports()[0]).toMatchObject({
      type: "region",
      rect: { x: 20, y: 12, width: 180, height: 28 },
      scroll: { x: 0, y: 300 },
      ref: 1,
      element: { selector: "#title" },
    });
    expect(part("drag").style.display).toBe("none");
  });

  it("ignores events the user didn't make", () => {
    install(true);
    control().mode(true);
    sent = [];
    click(20, 110);
    mouse("pointermove", 20, 110);
    frames();
    expect(sent).toEqual([]);
    expect(part("hover").style.display).not.toBe("block");
  });

  it("stops a drag when it is turned off", () => {
    install();
    control().mode(true);
    mouse("pointerdown", 20, 12);
    mouse("pointermove", 200, 40);
    control().mode(false);
    expect(part("drag").style.display).toBe("none");
  });
});

describe("AC4: markers", () => {
  it("are numbered on their elements, and the open one stands out", () => {
    install();
    control().sync([marker(), marker({ id: "a2", n: 2, refs: [9], selectors: ["#title"], active: true })]);
    expect(marks().map((m) => [m.textContent, m.style.left, m.style.top, m.classList.contains("active")])).toEqual([
      ["1", "12px", "100px", false],
      ["2", "12px", "12px", true],
    ]);
  });

  it("follow their elements as the page scrolls or resizes", () => {
    install();
    control().mode(true);
    click(20, 110);
    frames();
    control().sync([marker()]);
    layout(document.getElementById("buy")!, { x: 200, y: 40, width: 80, height: 30 });
    frames(1);
    expect([marks()[0]!.style.left, marks()[0]!.style.top]).toEqual(["200px", "40px"]);
  });

  it("find their elements again by selector when the page renders them anew, on their own page only", () => {
    install();
    control().sync([marker({ refs: [7] })]);
    const fresh = document.createElement("button");
    fresh.id = "buy";
    document.getElementById("buy")!.replaceWith(fresh);
    layout(fresh, { x: 300, y: 300, width: 80, height: 30 });
    frames(1);
    expect(marks()[0]!.style.left).toBe("300px");
    history.pushState(null, "", "/other");
    const elsewhere = document.createElement("button");
    elsewhere.id = "buy";
    fresh.replaceWith(elsewhere);
    layout(elsewhere, { x: 50, y: 50, width: 80, height: 30 });
    frames(1);
    expect(marks()[0]!.style.display).toBe("none");
  });

  it("keep a region on its place in the document, shown only on its page", () => {
    install();
    control().sync([marker({ refs: [], selectors: [], region: { x: 20, y: 320, width: 50, height: 40 } })]);
    Object.defineProperty(window, "scrollY", { value: 300, configurable: true });
    frames(1);
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    expect(part("outline").style).toMatchObject({ display: "block", left: "20px", top: "20px" });
    history.pushState(null, "", "/other#x");
    frames(1);
    expect(part("outline").style.display).toBe("none");
  });

  it("ignore the hash: a marker shows on its page whatever the hash", () => {
    install();
    control().sync([marker({ refs: [], selectors: [], region: { x: 20, y: 20, width: 5, height: 5 } })]);
    history.pushState(null, "", "/plans#pricing");
    frames(1);
    expect(part("outline").style.display).toBe("block");
  });

  it("open their annotation when clicked", () => {
    install();
    control().sync([marker()]);
    sent = [];
    marks()[0]!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(reports()).toEqual([{ type: "open", id: "a1" }]);
  });

  it("go when their annotation does", () => {
    install();
    control().sync([marker(), marker({ id: "a2", n: 2 })]);
    control().sync([marker({ id: "a2", n: 1 })]);
    expect(marks().map((m) => m.textContent)).toEqual(["1"]);
  });
});
