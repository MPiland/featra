import { describe, expect, it } from "vitest";
import { DEFAULT_ZOOM, normalizeZoom, ZOOM_FACTORS, zoomIn, zoomOut } from "../src/zoom.ts";

describe("zoom steps", () => {
  it("zooms in and out one step at a time from 100%", () => {
    expect(DEFAULT_ZOOM).toBe(1);
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomIn(1.1)).toBe(1.25);
    expect(zoomOut(1)).toBe(0.9);
    expect(zoomOut(0.9)).toBe(0.8);
  });

  it("stops at the smallest and largest step", () => {
    expect(zoomIn(ZOOM_FACTORS.at(-1)!)).toBe(ZOOM_FACTORS.at(-1));
    expect(zoomOut(ZOOM_FACTORS[0]!)).toBe(ZOOM_FACTORS[0]);
  });

  it("walks every step up and back down", () => {
    const up = [ZOOM_FACTORS[0]!];
    while (up.at(-1)! < ZOOM_FACTORS.at(-1)!) up.push(zoomIn(up.at(-1)!));
    expect(up).toEqual(ZOOM_FACTORS);
    const down = [ZOOM_FACTORS.at(-1)!];
    while (down.at(-1)! > ZOOM_FACTORS[0]!) down.push(zoomOut(down.at(-1)!));
    expect(down).toEqual([...ZOOM_FACTORS].reverse());
  });

  it("moves to the next step from a value between steps", () => {
    expect(zoomIn(1.05)).toBe(1.1);
    expect(zoomOut(1.05)).toBe(1);
  });

  it("normalizes stored values", () => {
    expect(normalizeZoom(undefined)).toBe(1);
    expect(normalizeZoom(0)).toBe(1);
    expect(normalizeZoom(Number.NaN)).toBe(1);
    expect(normalizeZoom(0.66)).toBe(0.67);
    expect(normalizeZoom(0.1)).toBe(0.5);
  });
});
