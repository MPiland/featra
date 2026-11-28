/**
 * STORY-75: a Browser pane's annotations (annotations.ts, ADR 0048), owned by the main process. Each change tells the
 * window; numbers are places in the list; a new one opens to edit; STORY-76's Send reads the list and clears it.
 */
import { describe, expect, it } from "vitest";
import type { AnnotationsState } from "@featra/client/annotate";
import { ANNOTATION_LIMITS } from "@featra/client/annotate";
import { createAnnotations, type Captured } from "../src/annotations.ts";

const element = (selector: string) => ({ selector, tag: "button", snippet: `<button>`, styles: {} });
const captured = (over: Partial<Captured> = {}): Captured => ({
  kind: "elements",
  elements: [element("#save")],
  region: null,
  url: "http://localhost:5173/",
  viewport: { width: 800, height: 600, dpr: 1, device: null },
  screenshot: "data:image/png;base64,AAAA",
  consoleErrors: [],
  source: null,
  ...over,
});
const store = () => {
  const told: AnnotationsState[] = [];
  const typed: boolean[] = [];
  return {
    told,
    typed,
    s: createAnnotations((state, t) => {
      told.push(state);
      typed.push(t);
    }),
  };
};

describe("a pane's annotations", () => {
  it("start empty, with Annotate off", () => {
    expect(store().s.state()).toEqual({ annotating: false, list: [], editing: null, capturing: false });
  });

  it("tell the window each change, and nothing when nothing changed", () => {
    const { s, told } = store();
    s.setAnnotating(true);
    s.setAnnotating(true);
    expect(told).toEqual([{ annotating: true, list: [], editing: null, capturing: false }]);
  });

  it("open a new annotation to edit, without a comment, and keep its overlay refs out of what the window sees", () => {
    const { s, told } = store();
    const id = s.add(captured(), [4]);
    expect(id).toBe("a1");
    expect(told.at(-1)).toEqual({
      annotating: false,
      list: [{ ...captured(), id: "a1", comment: "" }],
      editing: "a1",
      capturing: false,
    });
    expect(s.placed()).toEqual([{ ...captured(), id: "a1", comment: "", refs: [4], n: 1 }]);
  });

  it("take a comment, cut to size, and ignore one for an annotation that isn't there", () => {
    const { s, told } = store();
    s.add(captured(), [1]);
    s.comment("a1", "Make it blue");
    expect(s.list()[0]?.comment).toBe("Make it blue");
    const before = told.length;
    s.comment("a1", "Make it blue");
    s.comment("a9", "x");
    expect(told.length).toBe(before);
    s.comment("a1", "x".repeat(ANNOTATION_LIMITS.comment + 5));
    expect(s.list()[0]?.comment.length).toBe(ANNOTATION_LIMITS.comment);
  });

  it("add an element to an elements annotation, with the new screenshot, once each", () => {
    const { s } = store();
    s.add(captured(), [1]);
    s.addElement("a1", element("h1"), 2, "data:image/png;base64,BBBB");
    s.addElement("a1", element("h1"), 3, "data:image/png;base64,CCCC");
    expect(s.list()[0]?.elements.map((e) => e.selector)).toEqual(["#save", "h1"]);
    expect(s.list()[0]?.screenshot).toBe("data:image/png;base64,BBBB");
    expect(s.placed()[0]?.refs).toEqual([1, 2]);
  });

  it("add no element to a region", () => {
    const { s } = store();
    s.add(captured({ kind: "region", region: { x: 0, y: 0, width: 10, height: 10 } }), [1]);
    s.addElement("a1", element("h1"), 2, null);
    expect(s.list()[0]?.elements).toHaveLength(1);
  });

  it("number by place, closing up when one is deleted, which also stops its edit", () => {
    const { s } = store();
    s.add(captured(), [1]);
    s.add(captured(), [2]);
    s.add(captured(), [3]);
    s.remove("a2");
    expect(s.placed().map((a) => [a.id, a.n])).toEqual([
      ["a1", 1],
      ["a3", 2],
    ]);
    expect(s.editing).toBe("a3");
    s.remove("a3");
    expect(s.editing).toBeNull();
  });

  it("edit only an annotation that is there", () => {
    const { s } = store();
    s.add(captured(), [1]);
    s.edit(null);
    expect(s.editing).toBeNull();
    s.edit("a7");
    expect(s.editing).toBeNull();
    s.edit("a1");
    expect(s.editing).toBe("a1");
  });

  // Review fix 8: read and cleared in one step, so nothing added between them is lost.
  it("give STORY-76 the list in order, and clear it once sent", () => {
    const { s, told } = store();
    s.add(captured({ url: "http://localhost:5173/a" }), [1]);
    s.add(captured({ url: "http://localhost:5173/b" }), [2]);
    expect(s.list().map((a) => a.url)).toEqual(["http://localhost:5173/a", "http://localhost:5173/b"]);
    expect(s.take().map((a) => a.url)).toEqual(["http://localhost:5173/a", "http://localhost:5173/b"]);
    expect(told.at(-1)).toEqual({ annotating: false, list: [], editing: null, capturing: false });
    const before = told.length;
    expect(s.take()).toEqual([]);
    expect(told.length).toBe(before);
  });

  // Review fix 2: each has a screenshot, so a pane keeps a bounded number.
  it("keep " + ANNOTATION_LIMITS.annotations + " at most, ignoring more", () => {
    const { s } = store();
    for (let i = 0; i < ANNOTATION_LIMITS.annotations; i++) expect(s.add(captured(), [i])).not.toBeNull();
    expect(s.add(captured(), [99])).toBeNull();
    expect(s.list()).toHaveLength(ANNOTATION_LIMITS.annotations);
  });

  it("say when a change is only a comment typed, and when a pick is being captured", () => {
    const { s, told, typed } = store();
    s.add(captured(), [1]);
    s.comment("a1", "Red");
    expect(typed).toEqual([false, true]);
    s.setCapturing(true);
    s.setCapturing(true);
    expect(told.at(-1)?.capturing).toBe(true);
    expect(typed).toEqual([false, true, false]);
  });
});
