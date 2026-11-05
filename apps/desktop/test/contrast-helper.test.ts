import { describe, expect, it } from "vitest";
import { contrast, parseCssColor, resolve } from "../e2e/contrast.ts";

/** Sanity checks for the WCAG maths the contrast e2e test relies on. */
describe("contrast helper", () => {
  it("matches WCAG reference ratios", () => {
    expect(contrast([0, 0, 0, 1], [255, 255, 255, 1])).toBeCloseTo(21, 5);
    expect(contrast([255, 255, 255, 1], [255, 255, 255, 1])).toBeCloseTo(1, 5);
    // #767676 on white is the classic 4.54:1 AA boundary grey.
    expect(contrast([118, 118, 118, 1], [255, 255, 255, 1])).toBeCloseTo(4.54, 2);
  });

  it("parses computed colours", () => {
    expect(parseCssColor("rgb(28, 28, 30)")).toEqual([28, 28, 30, 1]);
    expect(parseCssColor("rgba(0, 0, 0, 0.5)")).toEqual([0, 0, 0, 0.5]);
  });

  it("resolves translucent backgrounds and faded text", () => {
    const { fg, bg } = resolve({
      what: "x",
      fg: "rgb(255, 255, 255)",
      bgs: ["rgba(0, 0, 0, 0.5)", "rgb(255, 255, 255)"],
      opacity: 0.5,
      large: false,
    });
    expect(bg.map(Math.round)).toEqual([128, 128, 128, 1]);
    expect(fg.map(Math.round)).toEqual([191, 191, 191, 1]);
  });
});
