/**
 * STORY-75 AC4: the overlay's numbered markers (annotate/overlay.ts), on a real DOM (jsdom). They stay on their elements
 * as the page moves them, scrolls or changes its route, sit just outside the box so they cover none of it, outline each
 * element of an annotation, and open their annotation when clicked. Fakes only what jsdom can't do
 * (annotate-overlay-fakes.ts).
 */
import { describe, expect, it, vi } from "vitest";
import {
  clearSent,
  click,
  control,
  frames,
  install,
  layout,
  marker,
  marks,
  mouse,
  part,
  parts,
  reports,
  scrollTo,
  fakePageEachTest,
} from "./annotate-overlay-fakes.ts";

fakePageEachTest();

const box = (el: HTMLElement) => ({
  left: el.style.left,
  top: el.style.top,
  width: el.style.width,
  height: el.style.height,
});

describe("AC4: markers", () => {
  it("are numbered on their elements, and the open one stands out", () => {
    install();
    control().sync([marker(), marker({ id: "a2", n: 2, refs: [9], selectors: ["#title"], active: true })]);
    // Just above the box's top left corner; below its bottom left when there is no room above.
    expect(marks().map((m) => [m.textContent, m.style.left, m.style.top, m.classList.contains("active")])).toEqual([
      ["1", "10px", "76px", false],
      ["2", "10px", "52px", true],
    ]);
  });

  it("follow their elements as the page scrolls or resizes", () => {
    install();
    control().mode(true);
    click(20, 110);
    frames();
    control().sync([marker()]);
    layout(document.getElementById("buy")!, { x: 200, y: 40, width: 80, height: 30 });
    frames(1);
    expect([marks()[0]!.style.left, marks()[0]!.style.top]).toEqual(["200px", "16px"]);
  });

  it("find their elements again by selector when the page renders them anew, on their own page only", () => {
    install();
    control().sync([marker({ refs: [7] })]);
    const fresh = document.createElement("button");
    fresh.id = "buy";
    document.getElementById("buy")!.replaceWith(fresh);
    layout(fresh, { x: 300, y: 300, width: 80, height: 30 });
    frames(1);
    expect(marks()[0]!.style.left).toBe("300px");
    history.pushState(null, "", "/other");
    const elsewhere = document.createElement("button");
    elsewhere.id = "buy";
    fresh.replaceWith(elsewhere);
    layout(elsewhere, { x: 50, y: 50, width: 80, height: 30 });
    frames(1);
    expect(marks()[0]!.style.display).toBe("none");
  });

  it("keep a region on its place in the document, shown only on its page", () => {
    install();
    control().sync([marker({ refs: [], selectors: [], region: { x: 20, y: 320, width: 50, height: 40 } })]);
    scrollTo(300);
    frames(1);
    scrollTo(0);
    expect(part("outline").style).toMatchObject({ display: "block", left: "20px", top: "20px" });
    history.pushState(null, "", "/other#x");
    frames(1);
    expect(part("outline").style.display).toBe("none");
  });

  it("ignore the hash: a marker shows on its page whatever the hash", () => {
    install();
    control().sync([marker({ refs: [], selectors: [], region: { x: 20, y: 20, width: 5, height: 5 } })]);
    history.pushState(null, "", "/plans#pricing");
    frames(1);
    expect(part("outline").style.display).toBe("block");
  });

  it("open their annotation when clicked", () => {
    install();
    control().sync([marker()]);
    clearSent();
    marks()[0]!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(reports()).toEqual([{ type: "open", id: "a1" }]);
  });

  it("go when their annotation does", () => {
    install();
    control().sync([marker(), marker({ id: "a2", n: 2 })]);
    control().sync([marker({ id: "a2", n: 1 })]);
    expect(marks().map((m) => m.textContent)).toEqual(["1"]);
  });

  // Visual review C: one annotation of two elements outlines each, not the box around both and what is between.
  it("outline each element of an annotation, with its number on the first", () => {
    install();
    control().sync([marker({ refs: [7, 8], selectors: ["#title", "#buy"] })]);
    expect(parts("outline").map(box)).toEqual([
      { left: "10px", top: "10px", width: "300px", height: "40px" },
      { left: "10px", top: "100px", width: "80px", height: "30px" },
    ]);
    expect(marks().map((m) => [m.style.left, m.style.top])).toEqual([["10px", "52px"]]);
  });

  // Visual review D: a region shows where it was drawn, at scale 1, scrolled or not.
  it("show a region exactly where it was drawn", () => {
    install();
    control().mode(true);
    for (const scroll of [0, 300]) {
      scrollTo(scroll);
      clearSent();
      mouse("pointerdown", 20, 62);
      mouse("pointermove", 150, 78);
      mouse("pointerup", 150, 78);
      frames();
      const r = reports()[0] as { rect: { x: number; y: number; width: number; height: number } };
      const s = (reports()[0] as { scroll: { x: number; y: number } }).scroll;
      const region = { ...r.rect, x: r.rect.x + s.x, y: r.rect.y + s.y };
      control().sync([marker({ refs: [], selectors: [], region })]);
      frames(1);
      expect(box(part("outline"))).toEqual({ left: "20px", top: "62px", width: "130px", height: "16px" });
    }
  });

  // Review: an element not on the page is looked for again at most every quarter second, not each frame.
  it("look for a missing element only now and then", () => {
    install();
    const find = vi.spyOn(document, "querySelector");
    control().sync([marker({ refs: [7], selectors: ["#gone"] })]);
    frames(10);
    expect(find.mock.calls.filter(([s]) => s === "#gone")).toHaveLength(1);
    vi.advanceTimersByTime(300);
    frames(1);
    expect(find.mock.calls.filter(([s]) => s === "#gone").length).toBeGreaterThan(1);
  });
});
