/**
 * STORY-75 AC3: the source-file hint (annotate/source-hint.ts). It is read in the page from what its dev build left: an
 * inspector plugin's attribute, React 18's `_debugSource`, or React 19's `_debugStack`, here from real React 19 in dev;
 * then parsed in the main process, which keeps the app's own frame and drops React's, Vite's and the dependencies'.
 * Anything else leaves it out.
 */
import { act } from "@testing-library/react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { parseSourceHint, readSourceHint, readSourceHintOnThis } from "../src/annotate/source-hint.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

function SaveButton() {
  return <button type="button">Save</button>;
}

describe("reading the hint in the page", () => {
  it("finds React 19's dev stack for an element it rendered, and its parse names this file", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<SaveButton />));
    const raw = readSourceHint(host.querySelector("button")!);
    expect(raw).toEqual({ stack: expect.any(String) });
    const hint = parseSourceHint(raw);
    expect(hint?.file).toMatch(/annotate-source\.test\.tsx$/);
    expect(hint?.line).toBeGreaterThan(0);
    await act(async () => root.unmount());
  });

  it("takes an inspector plugin's attribute from the element or an ancestor first", () => {
    document.body.innerHTML = `<section data-insp-path="src/Plans.tsx:12:3"><p><b>Hi</b></p></section>`;
    expect(readSourceHint(document.querySelector("b")!)).toEqual({ attr: "src/Plans.tsx:12:3" });
    expect(parseSourceHint({ attr: "src/Plans.tsx:12:3" })).toEqual({ file: "src/Plans.tsx", line: 12, column: 3 });
  });

  it("takes React 18's source from the fiber", () => {
    document.body.innerHTML = `<p>Hi</p>`;
    const p = document.querySelector("p")!;
    Reflect.set(p, "__reactFiber$x1", {
      _debugSource: { fileName: "/app/src/Hi.tsx", lineNumber: 4, columnNumber: 9 },
    });
    expect(readSourceHint(p)).toEqual({ file: "/app/src/Hi.tsx", line: 4, column: 9 });
  });

  it("is nothing for a page with no dev build's marks", () => {
    document.body.innerHTML = `<p>Hi</p>`;
    expect(readSourceHint(document.querySelector("p")!)).toBeNull();
  });

  it("is called on the element as `this` by the protocol", () => {
    document.body.innerHTML = `<p data-v-inspector="src/A.vue:3:1">Hi</p>`;
    // oxlint-disable-next-line typescript/no-implied-eval -- the declaration main sends, called as the protocol calls it.
    const fn = new Function(`return (${readSourceHintOnThis()})`)() as (this: Element) => unknown;
    expect(fn.call(document.querySelector("p")!)).toEqual({ attr: "src/A.vue:3:1" });
  });

  // Review fix 3: the page's own code can make what it hands back anything; it is bounded before it is copied out.
  it("hands back nothing when the page makes the hint oversized or odd", () => {
    document.body.innerHTML = `<p data-v-inspector="src/A.vue:3:1">Hi</p>`;
    // oxlint-disable-next-line typescript/no-implied-eval -- the declaration main sends, called as the protocol calls it.
    const fn = new Function(`return (${readSourceHintOnThis()})`)() as (this: Element) => unknown;
    const slice = Object.getOwnPropertyDescriptor(String.prototype, "slice")!;
    const huge = "x".repeat(1_000_000);
    Reflect.defineProperty(String.prototype, "slice", { value: () => huge, configurable: true, writable: true });
    try {
      expect(fn.call(document.querySelector("p")!)).toBeNull();
    } finally {
      Reflect.defineProperty(String.prototype, "slice", slice);
    }
    Reflect.defineProperty(Object.prototype, "stack", { get: () => ({ length: 1 }), configurable: true });
    try {
      expect(fn.call(document.querySelector("p")!)).toBeNull();
    } finally {
      Reflect.deleteProperty(Object.prototype, "stack");
    }
  });
});

describe("parsing the hint in the main process", () => {
  it("takes a dev server URL's path, without its query or Vite's /@fs/", () => {
    expect(parseSourceHint({ file: "http://localhost:5173/src/App.tsx?t=123", line: 2, column: 1 })).toEqual({
      file: "src/App.tsx",
      line: 2,
      column: 1,
    });
    expect(parseSourceHint({ attr: "http://localhost:5173/@fs/home/me/app/src/A.tsx?v=1:5:2" })).toEqual({
      file: "/home/me/app/src/A.tsx",
      line: 5,
      column: 2,
    });
    expect(parseSourceHint({ attr: "http://localhost:5173/@fs/D:/app/src/A.tsx:5:2" })?.file).toBe("D:/app/src/A.tsx");
    expect(parseSourceHint({ attr: "file:///D:/app/src/A.tsx:5:2" })).toEqual({
      file: "D:/app/src/A.tsx",
      line: 5,
      column: 2,
    });
  });

  it("keeps the stack's first frame that is the app's own", () => {
    const stack = [
      "Error: react-stack-top-frame",
      "    at exports.jsxDEV (http://localhost:5173/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=1:250:30)",
      "    at http://localhost:5173/@vite/client:10:1",
      "    at Plans (http://localhost:5173/src/Plans.tsx?t=99:31:7)",
      "    at App (http://localhost:5173/src/App.tsx:8:3)",
    ].join("\n");
    expect(parseSourceHint({ stack })).toEqual({ file: "src/Plans.tsx", line: 31, column: 7 });
  });

  it("is nothing for a stack of only React's frames, or anything malformed", () => {
    expect(parseSourceHint({ stack: "Error\n    at jsxDEV (http://x/node_modules/react/a.js:1:1)" })).toBeNull();
    expect(parseSourceHint({ attr: "no line here" })).toBeNull();
    expect(parseSourceHint({ file: 4 })).toBeNull();
    expect(parseSourceHint("src/A.tsx:1:1")).toBeNull();
    expect(parseSourceHint(null)).toBeNull();
  });

  it("cuts a long file to size", () => {
    expect(parseSourceHint({ file: `src/${"a".repeat(900)}.tsx`, line: 1 })?.file.length).toBe(500);
  });
});
