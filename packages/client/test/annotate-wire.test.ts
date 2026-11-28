/**
 * STORY-75 review fix 2: a pane's annotations on their way to the window (annotations-wire.ts). Each screenshot goes
 * once, when it is new or changed; a comment typed sends none; the window still has the whole state.
 */
import { describe, expect, it } from "vitest";
import { ANNOTATION_LIMITS, normalizeAnnotations, type Annotation, type AnnotationsState } from "../src/annotations.ts";
import { createAnnotationsReader, createAnnotationsSender } from "../src/annotations-wire.ts";

const annotation = (id: string, over: Partial<Annotation> = {}): Annotation => ({
  id,
  comment: "",
  kind: "elements",
  elements: [{ selector: "#save", tag: "button", snippet: "<button>", styles: {} }],
  region: null,
  url: "http://localhost:5173/",
  viewport: { width: 800, height: 600, dpr: 1, device: null },
  screenshot: `data:image/png;base64,${id.toUpperCase()}`,
  consoleErrors: [],
  source: null,
  ...over,
});
const state = (list: Annotation[]): AnnotationsState => ({ annotating: true, list, editing: null, capturing: false });

describe("annotations on their way to the window", () => {
  it("carry each screenshot once, and the window keeps it", () => {
    const send = createAnnotationsSender();
    const read = createAnnotationsReader();
    const first = state([annotation("a1")]);
    const m1 = send(first);
    expect(m1.shots).toEqual({ a1: "data:image/png;base64,A1" });
    expect(m1.list[0]).not.toHaveProperty("screenshot");
    expect(read(m1)).toEqual(first);
    const typed = state([annotation("a1", { comment: "Bigger" })]);
    const m2 = send(typed);
    expect(m2.shots).toEqual({});
    expect(JSON.stringify(m2)).not.toContain("base64");
    expect(read(m2)).toEqual(typed);
  });

  it("carry a screenshot again when it changes, and forget one whose annotation is gone", () => {
    const send = createAnnotationsSender();
    const read = createAnnotationsReader();
    read(send(state([annotation("a1"), annotation("a2")])));
    const changed = state([annotation("a1", { screenshot: "data:image/png;base64,BOTH" })]);
    const m1 = send(changed);
    expect(m1.shots).toEqual({ a1: "data:image/png;base64,BOTH" });
    expect(read(m1)).toEqual(changed);
    // a2 is gone: if it came back by the same id, its screenshot would be sent again.
    const back = state([annotation("a1", { screenshot: "data:image/png;base64,BOTH" }), annotation("a2")]);
    const m = send(back);
    expect(m.shots).toEqual({ a2: "data:image/png;base64,A2" });
    expect(read(m)).toEqual(back);
  });

  it("are read defensively, as ever", () => {
    const read = createAnnotationsReader();
    expect(read({ list: [{ id: "a1" }], shots: { a1: "https://evil.example/x.png" }, capturing: "yes" })).toMatchObject(
      {
        list: [{ id: "a1", screenshot: null }],
        capturing: false,
      },
    );
    expect(read(undefined)).toEqual(normalizeAnnotations(undefined));
  });

  it("are no more than a pane keeps", () => {
    const list = Array.from({ length: ANNOTATION_LIMITS.annotations + 5 }, (_, i) => ({ id: `a${i}` }));
    expect(normalizeAnnotations({ list }).list).toHaveLength(ANNOTATION_LIMITS.annotations);
  });
});
