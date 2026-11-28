/**
 * STORY-75: Annotate over the page's life (annotator.ts, page-world.ts, ADR 0048), from the review of PR #96. On and off
 * as asked last; picks still being captured count; Shift adds only on the annotation's own page; only the main frame's
 * world counts; each call into the page keeps its own objects; a debugger let go starts over; later pages get no
 * overlay once there is nothing to show; the window hears a comment once its typing rests, and each screenshot once.
 * Fakes only the platform (annotator-fakes.ts).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANNOTATION_LIMITS, OVERLAY_WORLD } from "@featra/client/annotate";
import { TYPED_MS } from "../src/annotator.ts";
import { WORLD, heading, pick, settle, setup } from "./annotator-fakes.ts";

const count = (t: ReturnType<typeof setup>, method: string) => t.dbg.commands.filter(([m]) => m === method).length;

afterEach(() => {
  vi.useRealTimers();
});

describe("turning Annotate on and off", () => {
  // Review fix 6: off asked while on is still starting is what holds.
  it("leaves it off when off is asked while on is still starting", async () => {
    const t = setup();
    const on = t.annotator.annotate(true);
    const off = t.annotator.annotate(false);
    await Promise.all([on, off]);
    expect(t.annotator.state().annotating).toBe(false);
    expect(t.told.some((s) => s.annotating)).toBe(false);
  });
});

describe("a pick still being captured", () => {
  // Review fix 7: the window counts it as unsent, so closing the pane asks first.
  it("is told to the window until it is an annotation", async () => {
    const t = setup();
    let done: ((shot: string | null) => void) | undefined;
    t.capture.mockImplementationOnce(() => new Promise((r) => (done = r)));
    await t.start();
    t.report(pick());
    await settle();
    expect(t.last()).toMatchObject({ capturing: true, list: [] });
    done?.("data:image/png;base64,AAAA");
    await settle();
    expect(t.last()).toMatchObject({ capturing: false, list: [{ id: "a1" }] });
  });
});

describe("Shift on another page", () => {
  // Review fix 4: the annotation open was made on another page; a Shift-click here is an annotation of its own.
  it("makes an annotation of its own, not an element of the one open", async () => {
    const t = setup();
    await t.start();
    t.report(pick());
    await settle();
    t.go("http://localhost:5173/billing");
    t.report(pick({ ref: 6, add: true, element: heading }));
    await settle();
    expect(t.last().list.map((a) => a.elements.map((e) => e.selector))).toEqual([["#save"], ["main > h1"]]);
  });

  it("still adds on the same page, whatever the hash", async () => {
    const t = setup();
    await t.start();
    t.report(pick());
    await settle();
    t.go("http://localhost:5173/settings#billing");
    t.report(pick({ ref: 6, add: true, element: heading }));
    await settle();
    expect(t.last().list).toHaveLength(1);
  });
});

describe("the frames of the page", () => {
  // Review fix 9: a sub-frame's world, ready or not, is never the world that counts.
  it("count only the main frame's world", async () => {
    const t = setup();
    await t.start();
    t.context(10, OVERLAY_WORLD, false, "SUB");
    t.report({ type: "ready" }, 10);
    await settle();
    t.report(pick({ ref: 9 }), 10);
    await settle();
    expect(t.last().list).toEqual([]);
    t.report(pick(), WORLD);
    await settle();
    expect(t.last().list.map((a) => a.elements[0]?.selector)).toEqual(["#save"]);
  });
});

describe("calls into the page", () => {
  // Review fix 10: two picks at once each keep their own objects; one's release never frees the other's.
  it("each hold their objects in a group of their own", async () => {
    const t = setup();
    t.dbg.answers["Runtime.evaluate"] = (p) => (p.objectGroup ? { result: { objectId: "x" } } : undefined);
    await t.start();
    t.report(pick({ ref: 5 }));
    t.report(pick({ ref: 6 }));
    await settle();
    await settle();
    const groups = t.dbg.commands
      .filter(([m]) => m === "Runtime.releaseObjectGroup")
      .map(([, p]) => (p as { objectGroup: string }).objectGroup);
    expect(groups).toHaveLength(2);
    expect(new Set(groups).size).toBe(2);
  });
});

describe("the debugger let go", () => {
  // Review fix 11: DevTools opened on the page, or the page gone: Annotate is off, and starts over when turned on.
  it("turns Annotate off, and the next on starts the world again", async () => {
    const t = setup();
    await t.start();
    t.dbg.attached = false;
    t.dbg.emit("detach", {}, "Render process gone.");
    expect(t.last().annotating).toBe(false);
    await t.annotator.annotate(true);
    expect(t.dbg.attached).toBe(true);
    expect(count(t, "Runtime.addBinding")).toBe(2);
    expect(count(t, "Page.createIsolatedWorld")).toBe(2);
    expect(t.last().annotating).toBe(true);
  });
});

describe("nothing left to show", () => {
  // Review fix 12: Annotate off and no marker left: later pages get no overlay, so they can't tell Featra was there.
  it("stops the overlay for later pages, and not while a marker is left", async () => {
    const t = setup();
    await t.start();
    t.report(pick());
    await settle();
    t.annotator.escape();
    await settle();
    expect(count(t, "Page.removeScriptToEvaluateOnNewDocument")).toBe(0);
    t.annotator.remove("a1");
    await settle();
    expect(t.dbg.commands.filter(([m]) => m === "Page.removeScriptToEvaluateOnNewDocument")).toEqual([
      ["Page.removeScriptToEvaluateOnNewDocument", { identifier: "S1" }],
    ]);
  });

  it("starts again on the same page without a second overlay", async () => {
    const t = setup();
    await t.start();
    t.annotator.escape();
    await settle();
    await t.annotator.annotate(true);
    await settle();
    expect(count(t, "Page.addScriptToEvaluateOnNewDocument")).toBe(2);
    expect(count(t, "Page.createIsolatedWorld")).toBe(1);
    expect(t.evaluated().at(-1)).toBe("__featraOverlay.mode(true);__featraOverlay.sync([]);");
  });
});

describe("what the window is told", () => {
  // Review fix 2: typing a comment sends nothing per key; the screenshot goes once.
  it("is a comment once the typing rests, and each screenshot once", async () => {
    const t = setup();
    await t.start();
    t.report(pick());
    await settle();
    expect(t.sent.at(-1)?.shots).toEqual({});
    expect(t.sent.filter((m) => "a1" in m.shots)).toHaveLength(1);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const before = t.sent.length;
    for (const text of ["R", "Re", "Red"]) t.annotator.comment("a1", text);
    expect(t.sent.length).toBe(before);
    vi.advanceTimersByTime(TYPED_MS);
    expect(t.sent.length).toBe(before + 1);
    expect(t.sent.at(-1)?.shots).toEqual({});
    expect(t.last().list[0]).toMatchObject({ comment: "Red", screenshot: "data:image/png;base64,AAAA" });
    t.annotator.comment("a1", "Redder");
    t.annotator.edit(null);
    expect(t.last()).toMatchObject({ editing: null, list: [{ comment: "Redder" }] });
    vi.advanceTimersByTime(TYPED_MS);
    expect(t.sent.length).toBe(before + 2);
  });

  it("keeps " + ANNOTATION_LIMITS.annotations + " annotations at most, and says so in the log", async () => {
    const t = setup();
    await t.start();
    for (let i = 0; i <= ANNOTATION_LIMITS.annotations; i++) t.report(pick({ ref: i + 1 }));
    await settle();
    await settle();
    expect(t.annotator.list()).toHaveLength(ANNOTATION_LIMITS.annotations);
    expect(t.logs).toEqual([`Annotate keeps ${ANNOTATION_LIMITS.annotations} annotations at most.`]);
  });
});
