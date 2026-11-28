/**
 * STORY-75: the trust boundary (ADR 0048). The overlay's reports come from the page's renderer, which runs the page's
 * code, so the main process reads them as untrusted (annotate/messages.ts): known kinds only, sizes capped, text cut.
 * The window reads the annotations it is sent defensively too (normalizeAnnotations), and takes only a PNG data URL as
 * a screenshot.
 */
import { describe, expect, it } from "vitest";
import { ANNOTATION_LIMITS, normalizeAnnotations } from "../src/annotations.ts";
import { MAX_MESSAGE, readOverlayMessage } from "../src/annotate/messages.ts";

const element = { selector: "#buy", tag: "button", snippet: "<button>", styles: { color: "red" } };
const viewport = { width: 800, height: 600, dpr: 2 };
const rect = { x: 1, y: 2, width: 3, height: 4 };
const json = (v: unknown) => JSON.stringify(v);

describe("an overlay report", () => {
  it("is ready, open, a pick or a region", () => {
    expect(readOverlayMessage(json({ type: "ready" }))).toEqual({ type: "ready" });
    expect(readOverlayMessage(json({ type: "open", id: "a1" }))).toEqual({ type: "open", id: "a1" });
    expect(readOverlayMessage(json({ type: "pick", ref: 3, add: true, element, rect, viewport }))).toEqual({
      type: "pick",
      ref: 3,
      add: true,
      element,
      rect,
      viewport,
    });
    expect(
      readOverlayMessage(json({ type: "region", rect, scroll: { x: 0, y: 9 }, ref: 2, element, viewport })),
    ).toEqual({ type: "region", rect, scroll: { x: 0, y: 9 }, ref: 2, element, viewport });
  });

  it("is dropped when it isn't JSON, is too big, or is of no known kind", () => {
    expect(readOverlayMessage("{")).toBeNull();
    expect(readOverlayMessage(42)).toBeNull();
    expect(readOverlayMessage(json({ type: "eval", code: "x" }))).toBeNull();
    expect(readOverlayMessage(json({ type: "open", id: "x".repeat(101) }))).toBeNull();
    const big = json({
      type: "pick",
      ref: 1,
      element: { ...element, snippet: "x".repeat(MAX_MESSAGE) },
      rect,
      viewport,
    });
    expect(readOverlayMessage(big)).toBeNull();
  });

  it("is dropped when a pick lacks its element, ref, rect or viewport", () => {
    expect(readOverlayMessage(json({ type: "pick", ref: 0, element, rect, viewport }))).toBeNull();
    expect(readOverlayMessage(json({ type: "pick", ref: 1, element: { tag: "b" }, rect, viewport }))).toBeNull();
    expect(readOverlayMessage(json({ type: "pick", ref: 1, element, rect: { x: 1 }, viewport }))).toBeNull();
    expect(
      readOverlayMessage(json({ type: "pick", ref: 1, element, rect, viewport: { width: 0, height: 1 } })),
    ).toBeNull();
  });

  it("keeps a region without an element, and without a ref when it has no element", () => {
    expect(readOverlayMessage(json({ type: "region", rect, ref: 5, element: null, viewport }))).toEqual({
      type: "region",
      rect,
      scroll: { x: 0, y: 0 },
      ref: null,
      element: null,
      viewport,
    });
  });

  it("cuts an element's text to size and keeps only style names that are names", () => {
    const long = {
      selector: "s".repeat(900),
      tag: "t".repeat(90),
      snippet: "x".repeat(900),
      styles: { color: "red", "a;b": "x", n: 4 },
    };
    const r = readOverlayMessage(json({ type: "pick", ref: 1, element: long, rect, viewport }));
    expect(r?.type === "pick" && r.element).toEqual({
      selector: "s".repeat(ANNOTATION_LIMITS.selector),
      tag: "t".repeat(ANNOTATION_LIMITS.tag),
      snippet: "x".repeat(ANNOTATION_LIMITS.snippet),
      styles: { color: "red" },
    });
  });
});

describe("the annotations the window is sent", () => {
  const annotation = {
    id: "a1",
    comment: "Red",
    kind: "elements",
    elements: [element],
    region: null,
    url: "http://localhost:5173/",
    viewport: { width: 800, height: 600, dpr: 1, device: null },
    screenshot: "data:image/png;base64,AAAA",
    consoleErrors: ["Boom"],
    source: { file: "src/A.tsx", line: 1, column: 2 },
  };

  it("are kept as they are when well formed", () => {
    expect(normalizeAnnotations({ annotating: true, list: [annotation], editing: "a1" })).toEqual({
      annotating: true,
      list: [annotation],
      editing: "a1",
      capturing: false,
    });
  });

  it("take only a PNG data URL as a screenshot, and drop malformed ones and an editing id not in the list", () => {
    const state = normalizeAnnotations({
      annotating: "yes",
      list: [{ ...annotation, screenshot: "https://evil.example/x.png" }, { comment: "no id" }, 7],
      editing: "a9",
    });
    expect(state).toMatchObject({ annotating: false, editing: null });
    expect(state.list).toHaveLength(1);
    expect(state.list[0]?.screenshot).toBeNull();
  });

  it("are none from nothing", () => {
    expect(normalizeAnnotations(undefined)).toEqual({ annotating: false, list: [], editing: null, capturing: false });
  });
});
