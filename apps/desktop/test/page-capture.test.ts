/**
 * STORY-75 review fix 5: an annotation's screenshot (page-capture.ts), taken by the page's renderer in the document's
 * CSS px: the rect the overlay gives in the layout viewport is moved by the page's scroll, and cut to what a pinch
 * leaves in view. Fakes only the debugger (browser-fakes.ts).
 */
import { describe, expect, it, vi } from "vitest";
import { CAPTURE_MS, captureClip } from "../src/page-capture.ts";
import { FakeDebugger, answerScreenshots } from "./browser-fakes.ts";

const clip = (dbg: FakeDebugger) =>
  (dbg.commands.find(([m]) => m === "Page.captureScreenshot")?.[1] as { clip: unknown } | undefined)?.clip;

describe("an annotation's screenshot", () => {
  it("is the rect in the document: the layout viewport's rect moved by the page's scroll", async () => {
    const dbg = new FakeDebugger();
    answerScreenshots(dbg, { pageX: 0, pageY: 300 }, { pageX: 0, pageY: 300, clientWidth: 375, clientHeight: 667 });
    expect(await captureClip(dbg, { x: 10, y: 20, width: 100, height: 40 })).toBe("data:image/png;base64,AAAA");
    expect(clip(dbg)).toEqual({ x: 10, y: 320, width: 100, height: 40, scale: 1 });
  });

  it("is cut to what a pinch leaves in view, and is nothing when none of it is", async () => {
    const dbg = new FakeDebugger();
    const pinched = { pageX: 50, pageY: 310, clientWidth: 150, clientHeight: 200 };
    answerScreenshots(dbg, { pageX: 0, pageY: 300 }, pinched);
    await captureClip(dbg, { x: 10, y: 20, width: 100, height: 40 });
    expect(clip(dbg)).toEqual({ x: 50, y: 320, width: 60, height: 40, scale: 1 });
    const none = new FakeDebugger();
    answerScreenshots(none, { pageX: 0, pageY: 300 }, pinched);
    expect(await captureClip(none, { x: 300, y: 20, width: 10, height: 10 })).toBeNull();
    expect(clip(none)).toBeUndefined();
  });

  it("is nothing when the renderer gives no picture", async () => {
    const dbg = new FakeDebugger();
    answerScreenshots(dbg, undefined, undefined, "");
    expect(await captureClip(dbg, { x: 0, y: 0, width: 10, height: 10 })).toBeNull();
  });

  it("gives up when the page doesn't answer in time", async () => {
    vi.useFakeTimers();
    try {
      const dbg = new FakeDebugger();
      dbg.sendCommand = () => new Promise(() => {});
      const caught = captureClip(dbg, { x: 0, y: 0, width: 10, height: 10 }).catch((err: unknown) => err);
      vi.advanceTimersByTime(CAPTURE_MS);
      await expect(caught).resolves.toMatchObject({ message: "The page didn't answer in time." });
    } finally {
      vi.useRealTimers();
    }
  });
});
