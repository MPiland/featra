/**
 * STORY-75 AC1: the Annotate overlay in the page (annotate/overlay.ts), on a real DOM (jsdom). In Annotate mode the
 * element under the pointer is highlighted; a click picks it, Shift-click adds it to the annotation open on this page,
 * a drag draws a region. Fakes only what jsdom can't do (annotate-overlay-fakes.ts).
 */
import { describe, expect, it, vi } from "vitest";
import { describeElement } from "../src/annotate/describe.ts";
import { overlaySource } from "../src/annotate/overlay.ts";
import {
  clearSent,
  click,
  control,
  frames,
  glass,
  install,
  marker,
  mouse,
  part,
  reports,
  scrollTo,
  sent,
  fakePageEachTest,
} from "./annotate-overlay-fakes.ts";

fakePageEachTest();

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

  // Review fix 1: a new document runs the overlay before its <html> exists, as the protocol runs it.
  it("waits for a new document's root element, then shows over the page", async () => {
    const root = document.documentElement;
    root.remove();
    expect(document.documentElement).toBeNull();
    install();
    expect(reports()).toEqual([{ type: "ready" }]);
    document.append(root);
    await Promise.resolve();
    expect(root.querySelector(":scope > featra-annotate")).not.toBeNull();
    control().mode(true);
    clearSent();
    click(20, 110);
    frames();
    expect(reports()[0]).toMatchObject({ type: "pick", element: { selector: "#buy" } });
  });

  it("goes from the page when asked, and can be installed again", () => {
    install();
    control().sync([marker()]);
    control().remove();
    expect(document.querySelector("featra-annotate")).toBeNull();
    frames(2);
    expect(document.querySelector("featra-annotate")).toBeNull();
    install();
    expect(document.querySelector("featra-annotate")).not.toBeNull();
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
    clearSent();
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
    clearSent();
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
    clearSent();
    click(20, 110, { shiftKey: true });
    frames();
    expect(reports().map((r) => r.add)).toEqual([false]);
  });

  // Review fix 4: the open annotation was made on another page; a Shift-click here is an annotation of its own.
  it("makes a Shift-click a pick of its own when the annotation open is another page's", () => {
    install();
    control().mode(true);
    control().sync([marker({ refs: [99], active: true, url: `${location.origin}/other` })]);
    clearSent();
    click(20, 20, { shiftKey: true });
    frames();
    expect(reports()[0]).toMatchObject({ type: "pick", add: false, rect: { x: 10, y: 10, width: 300, height: 40 } });
  });

  it("draws a region by a drag, in the document, with the element that holds it", () => {
    install();
    control().mode(true);
    scrollTo(300);
    clearSent();
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
    scrollTo(0);
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
    clearSent();
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
