/** STORY-4 AC5, AC6: how wide the card pane is, whatever the window's size and the width the user chose. */
import { describe, expect, it } from "vitest";
import { normalizePaneWidth, PANE_WIDTH, paneLimits, paneWidthFor, stepPaneWidth } from "../src/pane-width.ts";

describe("the card pane's width", () => {
  it("starts at 40% of the work area, between 320 and 720 px", () => {
    expect(paneWidthFor(null, 1008)).toBe(403);
    expect(paneWidthFor(null, 2400)).toBe(720);
    expect(paneWidthFor(null, 700)).toBe(320);
  });

  it("keeps a chosen width when it fits, and clamps one that doesn't", () => {
    expect(paneWidthFor(500, 1008)).toBe(500);
    expect(paneWidthFor(100, 1008)).toBe(PANE_WIDTH.min);
    expect(paneWidthFor(5000, 2400)).toBe(PANE_WIDTH.max);
  });

  it("always leaves the list its minimum width", () => {
    expect(paneWidthFor(700, 800)).toBe(800 - PANE_WIDTH.listMin);
    expect(paneLimits(800)).toEqual({ min: 320, max: 560 });
  });

  it("shares a work area too narrow for both minimums in their proportion, so nothing scrolls sideways", () => {
    // The app's minimum window (720 px) less the sidebar (272 px).
    expect(paneLimits(448)).toEqual({ min: 256, max: 256 });
    expect(paneWidthFor(null, 448)).toBe(256);
    expect(paneWidthFor(700, 448)).toBe(256);
  });

  it("uses only its own limits before the work area has been measured", () => {
    expect(paneLimits(0)).toEqual({ min: 320, max: 720 });
    expect(paneWidthFor(500, 0)).toBe(500);
    expect(paneWidthFor(null, 0)).toBe(320);
  });

  it("widens with Left, narrows with Right, and jumps to its limits with Home and End", () => {
    expect(stepPaneWidth(400, "ArrowLeft", 1008)).toBe(400 + PANE_WIDTH.step);
    expect(stepPaneWidth(400, "ArrowRight", 1008)).toBe(400 - PANE_WIDTH.step);
    expect(stepPaneWidth(325, "ArrowRight", 1008)).toBe(320);
    expect(stepPaneWidth(715, "ArrowLeft", 1008)).toBe(720);
    expect(stepPaneWidth(400, "Home", 1008)).toBe(320);
    expect(stepPaneWidth(400, "End", 1008)).toBe(720);
    expect(stepPaneWidth(400, "ArrowUp", 1008)).toBeNull();
    expect(stepPaneWidth(400, "Enter", 1008)).toBeNull();
  });

  it("reads a stored width defensively", () => {
    expect(normalizePaneWidth(500)).toBe(500);
    expect(normalizePaneWidth(500.4)).toBe(500);
    for (const bad of [null, "500", Number.NaN, Number.POSITIVE_INFINITY, 0, -20]) {
      expect(normalizePaneWidth(bad)).toBeNull();
    }
  });
});
