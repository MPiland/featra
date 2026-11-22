import { describe, expect, it } from "vitest";
import { BADGE_PX, BADGE_RED, BADGE_WHITE, overlayBitmap, overlayLabel, withDot } from "../src/badge-image.ts";
import { contrast, type Rgba } from "../e2e/contrast.ts";

const rgba = (c: readonly number[]) => [...c, 1] as Rgba;

/** STORY-67 AC1: the Windows overlay's drawing, read pixel by pixel from the real bitmap. */
function pixels(label: string) {
  const bitmap = overlayBitmap(label);
  const at = (x: number, y: number) => {
    const i = (y * BADGE_PX + x) * 4;
    return { b: bitmap[i], g: bitmap[i + 1], r: bitmap[i + 2], a: bitmap[i + 3] };
  };
  const ink: { x: number; y: number }[] = [];
  for (let y = 0; y < BADGE_PX; y += 1)
    for (let x = 0; x < BADGE_PX; x += 1) {
      const p = at(x, y);
      if (p.r === 255 && p.g === 255 && p.b === 255) ink.push({ x, y });
    }
  const xs = ink.map((p) => p.x);
  const ys = ink.map((p) => p.y);
  const box = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  return { bitmap, at, ink, box };
}

describe("AC1: the taskbar overlay draws the count on a red disc", () => {
  it("says the count up to nine, then 9+", () => {
    expect([1, 9, 10, 99].map(overlayLabel)).toEqual(["1", "9", "9+", "9+"]);
  });

  it("is a 32-pixel square in BGRA, clear outside the disc and red inside it", () => {
    const { bitmap, at } = pixels("1");
    expect(bitmap.length).toBe(BADGE_PX * BADGE_PX * 4);
    for (const [x, y] of [
      [0, 0],
      [BADGE_PX - 1, 0],
      [0, BADGE_PX - 1],
      [BADGE_PX - 1, BADGE_PX - 1],
    ] as const)
      expect(at(x, y)).toEqual({ b: 0, g: 0, r: 0, a: 0 });
    const [r, g, b] = BADGE_RED;
    expect(at(4, BADGE_PX / 2)).toEqual({ r, g, b, a: 255 });
  });

  it("draws each label in white, centred in the disc, two glyphs wider than one", () => {
    const one = pixels("1");
    const nine = pixels("9+");
    for (const { ink, box, at } of [one, nine]) {
      expect(ink.length).toBeGreaterThan(0);
      expect(ink.every(({ x, y }) => at(x, y).a === 255)).toBe(true);
      expect(Math.abs(box.left - (BADGE_PX - 1 - box.right))).toBeLessThanOrEqual(2);
      expect(Math.abs(box.top - (BADGE_PX - 1 - box.bottom))).toBeLessThanOrEqual(1);
    }
    expect(nine.box.right - nine.box.left).toBeGreaterThan(2 * (one.box.right - one.box.left));
  });

  it("draws a different picture for each label", () => {
    const labels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "9+"];
    const drawn = new Set(labels.map((l) => overlayBitmap(l).toString("base64")));
    expect(drawn.size).toBe(labels.length);
  });

  it("has white on red at 4.5:1 or more, so the number reads at 16 pixels", () => {
    expect(contrast(rgba(BADGE_WHITE), rgba(BADGE_RED))).toBeGreaterThanOrEqual(4.5);
  });
});
/** A 32-pixel icon of solid grey, premultiplied BGRA, as Electron gives the tray icon. */
const icon = () => Buffer.alloc(BADGE_PX * BADGE_PX * 4, 0x80);
/** The BGRA bytes of the pixel at (x, y). */
const pixel = (bitmap: Buffer, x: number, y: number) => [
  ...bitmap.subarray((y * BADGE_PX + x) * 4, (y * BADGE_PX + x) * 4 + 4),
];

describe("AC5: the tray icon with agents waiting has a red dot", () => {
  const [red, green, blue] = BADGE_RED;

  it("draws an opaque red dot in the bottom-right corner", () => {
    const dotted = withDot(icon(), BADGE_PX);
    expect(pixel(dotted, BADGE_PX - 6, BADGE_PX - 6)).toEqual([blue, green, red, 255]);
  });

  it("leaves the rest of the icon as it was, and the icon given untouched", () => {
    const base = icon();
    const dotted = withDot(base, BADGE_PX);
    expect(dotted.length).toBe(base.length);
    expect(pixel(dotted, 2, 2)).toEqual([0x80, 0x80, 0x80, 0x80]);
    expect(pixel(dotted, BADGE_PX - 6, 2)).toEqual([0x80, 0x80, 0x80, 0x80]);
    expect(base.every((byte) => byte === 0x80)).toBe(true);
  });

  it("cuts a clear ring around the dot, so it reads on any icon", () => {
    const dotted = withDot(icon(), BADGE_PX);
    const ring = [...Array(BADGE_PX).keys()].map((x) => pixel(dotted, x, BADGE_PX - 6)).filter(([, , , a]) => a === 0);
    expect(ring.length).toBeGreaterThan(0);
  });
});
