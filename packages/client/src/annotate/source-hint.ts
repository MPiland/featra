/**
 * The source-file hint (STORY-75, ADR 0048): where in the source the page's dev build says an element was made. Best
 * effort, React and Vite first: an inspector plugin's attribute (code-inspector's `data-insp-path`, Vue Inspector's
 * `data-v-inspector`), React's `_debugSource` (React 18 and before), or the first frame of React's `_debugStack` that
 * is the app's own code (React 19). Anything else leaves it out.
 *
 * `readSourceHint` runs in the page's own world, where React keeps its fibers, so it is self-contained and returns only
 * raw strings and numbers; `parseSourceHint` reads them in the main process, as the page's text may be anything.
 */
import { isRecord } from "@featra/work-format/guards";
import { ANNOTATION_LIMITS, readSource, type SourceHint } from "../annotations.ts";

export interface RawSourceHint {
  attr?: string;
  file?: string;
  line?: number;
  column?: number;
  stack?: string;
}

/* oxlint-disable unicorn/consistent-function-scoping, no-underscore-dangle -- It runs in the page, so its helpers must be
 * inside it; and React names its dev fields with an underscore. */
/** Called on the picked element in the page's world. */
export function readSourceHint(picked: Element): RawSourceHint | null {
  const ATTRS = ["data-insp-path", "data-v-inspector"];
  for (let el: Element | null = picked, depth = 0; el && depth < 30; el = el.parentElement, depth++) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v) return { attr: v.slice(0, 600) };
    }
  }
  type Fiber = {
    _debugSource?: { fileName?: unknown; lineNumber?: unknown; columnNumber?: unknown };
    _debugStack?: { stack?: unknown };
    _debugOwner?: Fiber | null;
    return?: Fiber | null;
  };
  for (let el: Element | null = picked, depth = 0; el && depth < 30; el = el.parentElement, depth++) {
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    if (!key) continue;
    let fiber: Fiber | undefined = Reflect.get(el, key);
    for (let i = 0; fiber && i < 30; i++, fiber = fiber._debugOwner ?? fiber.return ?? undefined) {
      const s = fiber._debugSource;
      if (s && typeof s.fileName === "string") {
        const n = (v: unknown) => (typeof v === "number" ? v : undefined);
        return { file: s.fileName.slice(0, 600), line: n(s.lineNumber), column: n(s.columnNumber) };
      }
      const stack = fiber._debugStack?.stack;
      if (typeof stack === "string") return { stack: stack.slice(0, 4000) };
    }
    return null;
  }
  return null;
}
/* oxlint-enable unicorn/consistent-function-scoping, no-underscore-dangle */

/** `readSourceHint` as a function CDP calls on the element (`this`). */
export const readSourceHintOnThis = (): string => `function () { return (${readSourceHint.toString()})(this); }`;

/** Frames that are React's, the dev server's or a dependency's, not the app's. */
const NOT_APP =
  /node_modules|react-stack-top-frame|jsx-dev-runtime|jsx-runtime|react-dom|\/@vite\/|\/@react-refresh|<anonymous>|\(native\)/;

/** A location's file: an http(s) or file URL's path, without its query; a path as it is. */
function fileOf(location: string): string {
  if (/^https?:\/\//.test(location) || location.startsWith("file://")) {
    try {
      const u = new URL(location);
      const path = decodeURIComponent(u.pathname);
      if (u.protocol === "file:") return path.replace(/^\/([A-Za-z]:)/, "$1");
      // Vite serves a file outside the root at /@fs/ and its absolute path; the root's own files at their path in it.
      if (path.startsWith("/@fs/")) return path.slice(4).replace(/^\/([A-Za-z]:)/, "$1");
      return path.replace(/^\//, "");
    } catch {
      return location;
    }
  }
  return location.replace(/\?.*$/, "");
}

/** `file:line:col` (and anything after) into its parts; null when it has no line. */
function located(s: string): SourceHint | null {
  const m = /^(.+?):(\d+)(?::(\d+))?(?::.*)?$/.exec(s.trim());
  if (!m) return null;
  const [, file = "", line, column] = m;
  return readSource({ file: fileOf(file), line: Number(line), column: column ? Number(column) : null });
}

/** The first frame of a stack that is the app's own code. */
function fromStack(stack: string): SourceHint | null {
  for (const line of stack.split("\n").slice(0, 40)) {
    const m = /^\s*at (?:.*? \()?(.+?)\)?\s*$/.exec(line);
    if (!m || NOT_APP.test(line)) continue;
    const found = located((m[1] ?? "").replace(/\?[^:]*(?=:\d+)/, ""));
    if (found) return found;
  }
  return null;
}

/** The page's raw hint, read in the main process; null when there is none, or it says nothing usable. */
export function parseSourceHint(raw: unknown): SourceHint | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.attr === "string") return located(raw.attr.slice(0, ANNOTATION_LIMITS.file + 100));
  if (typeof raw.file === "string") return readSource({ file: fileOf(raw.file), line: raw.line, column: raw.column });
  if (typeof raw.stack === "string") return fromStack(raw.stack);
  return null;
}
