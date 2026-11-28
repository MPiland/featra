/**
 * STORY-75: the annotator's tests' page (annotator.test.ts, annotator-capture.test.ts): a pane's page as the annotator
 * sees it, with its debugger (browser-fakes.ts) answering as Chromium's would, its contexts made (the page's own, Featra's
 * world, and another world), and the overlay's reports sent through the binding as a context of choice. What the window
 * is told is kept as sent (`sent`) and as the window reads it (`told`).
 */
import { EventEmitter } from "node:events";
import { vi } from "vitest";
import {
  OVERLAY_BINDING,
  OVERLAY_WORLD,
  createAnnotationsReader,
  type AnnotationsMessage,
  type AnnotationsState,
  type OverlayMessage,
} from "@featra/client/annotate";
import { createAnnotator } from "../src/annotator.ts";
import { FakeDebugger, fakeImage } from "./browser-fakes.ts";

export const MAIN = 1;
export const WORLD = 2;
export const OTHER = 3;
export const viewport = { width: 800, height: 600, dpr: 2 };
export const button = {
  selector: "#save",
  tag: "button",
  snippet: '<button id="save">Save</button>',
  styles: { color: "red" },
};
export const heading = { selector: "main > h1", tag: "h1", snippet: "<h1>Hi</h1>", styles: {} };
/** Lets the annotator's calls into the page run. */
export const settle = () => new Promise<void>((r) => setImmediate(r));

export function setup(device: string | null = null) {
  const dbg = new FakeDebugger();
  const page = new EventEmitter();
  let url = "http://localhost:5173/settings#top";
  const told: AnnotationsState[] = [];
  const sent: AnnotationsMessage[] = [];
  const read = createAnnotationsReader();
  const logs: string[] = [];
  const capture = vi.fn<(rect: unknown) => Promise<string | null>>(async () => fakeImage().toDataURL());
  const focusWindow = vi.fn<() => void>();
  dbg.answers["Page.getFrameTree"] = () => ({ frameTree: { frame: { id: "F" } } });
  dbg.answers["Page.createIsolatedWorld"] = () => ({ executionContextId: WORLD });
  dbg.answers["Page.addScriptToEvaluateOnNewDocument"] = () => ({ identifier: "S1" });
  const annotator = createAnnotator({
    page: {
      getURL: () => url,
      onConsole: (l) => void page.on("console-message", l),
      onNavigate: (l) => void page.on("did-navigate", l),
      debugger: dbg,
    },
    capture,
    device: () => device,
    send: (m) => {
      sent.push(m);
      told.push(read(m));
    },
    focusWindow,
    log: (m) => void logs.push(m),
  });
  const context = (id: number, name: string, isDefault: boolean, frameId = "F") =>
    dbg.emit("message", {}, "Runtime.executionContextCreated", {
      context: { id, name, auxData: { frameId, isDefault } },
    });
  context(MAIN, "", true);
  context(WORLD, OVERLAY_WORLD, false);
  context(OTHER, "someone-else", false);
  const report = (m: OverlayMessage | Record<string, unknown>, from = WORLD) =>
    dbg.emit("message", {}, "Runtime.bindingCalled", {
      name: OVERLAY_BINDING,
      payload: JSON.stringify(m),
      executionContextId: from,
    });
  const evaluated = () =>
    dbg.commands.filter(([m]) => m === "Runtime.evaluate").map(([, p]) => (p as { expression: string }).expression);
  const start = async () => {
    await annotator.annotate(true);
    report({ type: "ready" });
    await settle();
  };
  return {
    dbg,
    page,
    told,
    sent,
    context,
    logs,
    capture,
    focusWindow,
    annotator,
    report,
    evaluated,
    start,
    go: (to: string) => void (url = to),
    last: () => told.at(-1)!,
  };
}

export const pick = (over: Partial<Extract<OverlayMessage, { type: "pick" }>> = {}): OverlayMessage => ({
  type: "pick",
  ref: 5,
  add: false,
  element: button,
  rect: { x: 10.4, y: 20.6, width: 100, height: 30 },
  viewport,
  ...over,
});

/** Scripts the page's answers for the source hint: the element found, resolved in the page's world, and read there. */
export const answerSourceHint = (value: unknown) => (dbg: FakeDebugger) => {
  dbg.answers["Runtime.evaluate"] = (p) => (p.objectGroup ? { result: { objectId: "in-world" } } : undefined);
  dbg.answers["DOM.describeNode"] = () => ({ node: { backendNodeId: 42 } });
  dbg.answers["DOM.resolveNode"] = () => ({ object: { objectId: "in-page" } });
  dbg.answers["Runtime.callFunctionOn"] = () => ({ result: { value } });
};
