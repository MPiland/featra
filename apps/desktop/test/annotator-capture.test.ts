/**
 * STORY-75 AC2-AC4: what Annotate captures (annotator.ts, ADR 0048). Each pick or region becomes an annotation with its
 * screenshot, viewport, URL, elements, console errors and source hint, all read from the page and the view, so no
 * model is asked; a marker clicked opens its annotation. Fakes only the platform (annotator-fakes.ts).
 */
import { describe, expect, it } from "vitest";
import { fakeImage } from "./browser-fakes.ts";
import { MAIN, answerSourceHint, button, heading, pick, settle, setup, viewport } from "./annotator-fakes.ts";

describe("an element picked", () => {
  it("becomes an annotation, open to edit, with its screenshot, viewport, URL, element and console errors", async () => {
    const t = setup("iPhone 15");
    t.page.emit("console-message", {
      level: "error",
      message: "Boom",
      sourceId: "http://localhost:5173/app.js",
      lineNumber: 3,
    });
    t.page.emit("console-message", { level: "warning", message: "Careful" });
    t.page.emit("console-message", {}, 3, "Old boom", 0, "");
    await t.start();
    t.report(pick());
    await settle();
    expect(t.capture).toHaveBeenCalledWith({ x: 10, y: 20, width: 101, height: 31 });
    expect(t.last()).toEqual({
      annotating: true,
      editing: "a1",
      capturing: false,
      list: [
        {
          id: "a1",
          comment: "",
          kind: "elements",
          elements: [button],
          region: null,
          url: "http://localhost:5173/settings#top",
          viewport: { width: 800, height: 600, dpr: 2, device: "iPhone 15" },
          screenshot: fakeImage().toDataURL(),
          consoleErrors: ["Boom (http://localhost:5173/app.js:3)", "Old boom"],
          source: null,
        },
      ],
    });
    expect(t.focusWindow).toHaveBeenCalledOnce();
  });

  it("puts its marker on the element, by ref and selector, on its page without the hash", async () => {
    const t = setup();
    await t.start();
    t.report(pick());
    await settle();
    expect(t.evaluated().at(-1)).toBe(
      `__featraOverlay.mode(true);__featraOverlay.sync(${JSON.stringify([
        {
          id: "a1",
          n: 1,
          refs: [5],
          selectors: ["#save"],
          region: null,
          url: "http://localhost:5173/settings",
          active: true,
        },
      ])});`,
    );
  });

  it("with Shift adds to the annotation open, with a screenshot of them all", async () => {
    const t = setup();
    await t.start();
    t.report(pick());
    await settle();
    t.capture.mockResolvedValueOnce("data:image/png;base64,BOTH");
    t.report(pick({ ref: 6, add: true, element: heading, rect: { x: 0, y: 0, width: 200, height: 80 } }));
    await settle();
    expect(t.last().list).toHaveLength(1);
    expect(t.last().list[0]).toMatchObject({ elements: [button, heading], screenshot: "data:image/png;base64,BOTH" });
  });

  it("with Shift but nothing open is an annotation of its own", async () => {
    const t = setup();
    await t.start();
    t.report(pick());
    await settle();
    t.annotator.edit(null);
    t.report(pick({ ref: 6, add: true, element: heading }));
    await settle();
    expect(t.last().list.map((a) => a.elements[0]?.selector)).toEqual(["#save", "main > h1"]);
  });

  it("has no screenshot when none of it is in view, or the view gives none", async () => {
    const t = setup();
    await t.start();
    t.report(pick({ rect: { x: 0, y: 900, width: 10, height: 10 } }));
    await settle();
    t.capture.mockRejectedValueOnce(new Error("gone"));
    t.report(pick({ ref: 6 }));
    await settle();
    t.capture.mockResolvedValueOnce(null);
    t.report(pick({ ref: 7 }));
    await settle();
    expect(t.last().list.map((a) => a.screenshot)).toEqual([null, null, null]);
    expect(t.logs).toEqual(["Annotate couldn't capture the page: gone"]);
  });
});

describe("a region drawn", () => {
  it("becomes an annotation of the region in the document, with the element that holds it", async () => {
    const t = setup();
    await t.start();
    t.report({
      type: "region",
      rect: { x: 10, y: 20, width: 50, height: 40 },
      scroll: { x: 0, y: 300 },
      ref: 8,
      element: heading,
      viewport,
    });
    await settle();
    expect(t.capture).toHaveBeenCalledWith({ x: 10, y: 20, width: 50, height: 40 });
    expect(t.last().list[0]).toMatchObject({
      kind: "region",
      region: { x: 10, y: 320, width: 50, height: 40 },
      elements: [heading],
    });
    expect(t.evaluated().at(-1)).toContain(`"refs":[8],"selectors":["main > h1"],"region":{"x":10,"y":320`);
  });
});

describe("a marker clicked", () => {
  it("opens its annotation and gives the window the keyboard", async () => {
    const t = setup();
    await t.start();
    t.report(pick());
    await settle();
    t.annotator.edit(null);
    t.report({ type: "open", id: "a1" });
    await settle();
    expect(t.last().editing).toBe("a1");
    expect(t.focusWindow).toHaveBeenCalledTimes(2);
  });
});

describe("the source-file hint", () => {
  it("is read in the page's own world, on the element picked, from React's dev build", async () => {
    const t = setup();
    answerSourceHint({ stack: "Error\n    at Button (http://localhost:5173/src/Button.tsx?t=12:8:5)" })(t.dbg);
    await t.start();
    t.report(pick());
    await settle();
    expect(t.last().list[0]!.source).toEqual({ file: "src/Button.tsx", line: 8, column: 5 });
    const resolve = t.dbg.commands.find(([m]) => m === "DOM.resolveNode")![1];
    expect(resolve).toMatchObject({ backendNodeId: 42, executionContextId: MAIN });
    const call = t.dbg.commands.find(([m]) => m === "Runtime.callFunctionOn")![1];
    expect(call).toMatchObject({ objectId: "in-page", returnByValue: true });
  });

  it("is left out when the dev build gives none", async () => {
    const t = setup();
    answerSourceHint(null)(t.dbg);
    await t.start();
    t.report(pick());
    await settle();
    expect(t.last().list[0]!.source).toBeNull();
  });

  it("is left out when the page fails to answer", async () => {
    const t = setup();
    t.dbg.answers["DOM.describeNode"] = () => {
      throw new Error("No node");
    };
    await t.start();
    t.report(pick());
    await settle();
    expect(t.last().list).toHaveLength(1);
    expect(t.last().list[0]!.source).toBeNull();
  });
});
