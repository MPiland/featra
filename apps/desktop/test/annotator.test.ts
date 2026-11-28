/**
 * STORY-75: Annotate in a pane's page (annotator.ts, page-world.ts, ADR 0048). The overlay runs in Featra's own world of
 * the page, over the DevTools Protocol; only that world's reports count; console errors are the page's since it loaded;
 * Escape leaves Annotate; the list is read and cleared here, its one owner. Fakes only the platform (annotator-fakes.ts).
 */
import { describe, expect, it } from "vitest";
import { OVERLAY_BINDING, OVERLAY_WORLD, overlaySource } from "@featra/client/annotate";
import { inView } from "../src/annotator.ts";
import { MAIN, OTHER, WORLD, button, pick, settle, setup, viewport } from "./annotator-fakes.ts";

describe("starting Annotate in the page", () => {
  it("runs the overlay in a world of Featra's own, with a binding only that world has, in this document and the next", async () => {
    const t = setup();
    await t.annotator.annotate(true);
    expect(t.dbg.attached).toBe(true);
    expect(t.dbg.commands.map(([m]) => m)).toEqual([
      "Runtime.enable",
      "Page.enable",
      "Runtime.addBinding",
      "Page.addScriptToEvaluateOnNewDocument",
      "Page.getFrameTree",
      "Page.createIsolatedWorld",
      "Runtime.evaluate",
    ]);
    const [, binding] = t.dbg.commands[2]!;
    expect(binding).toEqual({ name: OVERLAY_BINDING, executionContextName: OVERLAY_WORLD });
    expect(t.dbg.commands[3]![1]).toEqual({ source: overlaySource(), worldName: OVERLAY_WORLD });
    expect(t.dbg.commands[5]![1]).toEqual({ frameId: "F", worldName: OVERLAY_WORLD });
    expect(t.dbg.commands[6]![1]).toEqual({ expression: overlaySource(), contextId: WORLD });
    expect(t.last().annotating).toBe(true);
  });

  it("starts once, however often it is turned on", async () => {
    const t = setup();
    await t.annotator.annotate(true);
    await t.annotator.annotate(false);
    await t.annotator.annotate(true);
    expect(t.dbg.commands.filter(([m]) => m === "Runtime.addBinding")).toHaveLength(1);
  });

  it("says so in the log when the page can't start it, and tries again next time", async () => {
    const t = setup();
    t.dbg.answers["Page.enable"] = () => {
      throw new Error("Target closed");
    };
    await t.annotator.annotate(true);
    expect(t.logs).toEqual(["Annotate couldn't start in the page: Target closed"]);
    delete t.dbg.answers["Page.enable"];
    await t.annotator.annotate(true);
    expect(t.dbg.commands.filter(([m]) => m === "Runtime.addBinding")).toHaveLength(1);
  });

  it("tells the overlay its mode and markers once it is ready", async () => {
    const t = setup();
    await t.start();
    expect(t.evaluated().at(-1)).toBe("__featraOverlay.mode(true);__featraOverlay.sync([]);");
  });
});

describe("what the overlay reports", () => {
  it("counts only from Featra's world: another world's or the page's call is ignored, as is a malformed one", async () => {
    const t = setup();
    await t.start();
    const before = t.told.length;
    t.report(pick(), OTHER);
    t.report(pick(), MAIN);
    t.report({ type: "pick", ref: 5, element: button, rect: { x: 0, y: 0 }, viewport });
    t.dbg.emit("message", {}, "Runtime.bindingCalled", {
      name: "other",
      payload: JSON.stringify(pick()),
      executionContextId: WORLD,
    });
    await settle();
    expect(t.told.length).toBe(before);
    expect(t.capture).not.toHaveBeenCalled();
  });

  it("counts only from the world's context now: one from a document since left is ignored", async () => {
    const t = setup();
    await t.start();
    t.dbg.emit("message", {}, "Runtime.executionContextCreated", {
      context: { id: 9, name: OVERLAY_WORLD, auxData: { frameId: "F2", isDefault: false } },
    });
    t.report({ type: "ready" }, 9);
    await settle();
    t.report(pick(), WORLD);
    await settle();
    expect(t.last().list).toEqual([]);
  });
});

describe("console errors", () => {
  it("start again with each new document, and keep the last 20, each cut to size", async () => {
    const t = setup();
    t.page.emit("console-message", { level: "error", message: "Before" });
    t.page.emit("did-navigate");
    for (let i = 0; i < 25; i++) t.page.emit("console-message", { level: "error", message: `E${i}${"x".repeat(600)}` });
    await t.start();
    t.report(pick());
    await settle();
    const errors = t.last().list[0]!.consoleErrors;
    expect(errors).toHaveLength(20);
    expect(errors[0]!.startsWith("E5x")).toBe(true);
    expect(errors.every((e) => e.length === 500)).toBe(true);
  });
});

describe("Escape in the page", () => {
  it("leaves Annotate when it is on, and does nothing otherwise", async () => {
    const t = setup();
    expect(t.annotator.escape()).toBe(false);
    await t.start();
    expect(t.annotator.escape()).toBe(true);
    expect(t.last().annotating).toBe(false);
    await settle();
    expect(t.evaluated().at(-1)).toBe("__featraOverlay.mode(false);__featraOverlay.sync([]);");
  });
});

describe("the part of a rect in view", () => {
  it("is in whole pixels within the viewport, or nothing", () => {
    const vp = { width: 800, height: 600 };
    expect(inView({ x: -5.5, y: 10.2, width: 20, height: 10 }, vp)).toEqual({ x: 0, y: 10, width: 15, height: 11 });
    expect(inView({ x: 790, y: 590, width: 50, height: 50 }, vp)).toEqual({ x: 790, y: 590, width: 10, height: 10 });
    expect(inView({ x: 0, y: 600, width: 50, height: 50 }, vp)).toBeNull();
  });
});

describe("the list, for STORY-76 and STORY-40", () => {
  it("is read and cleared here, its one owner", async () => {
    const t = setup();
    await t.start();
    t.report(pick());
    await settle();
    t.annotator.comment("a1", "Bigger");
    expect(t.annotator.list().map((a) => a.comment)).toEqual(["Bigger"]);
    t.annotator.clear();
    expect(t.annotator.list()).toEqual([]);
    expect(t.last().list).toEqual([]);
  });
});
