/**
 * Annotations (STORY-75, ADR 0048): what the user points at in the Browser pane's page, and what they want changed. The
 * main process owns each pane's list (one owner, read and cleared there, as STORY-76's Send will); the window shows it.
 * Everything an annotation captured from the page is the page's own text, so it is data: the window shows it as text,
 * never as HTML, and nothing reads it as instructions. Part of the host contract (bridge.ts).
 */
import { isRecord } from "@featra/work-format/guards";
import { rectOf, type Rect } from "./rect.ts";

/** The Annotate words: short and sentence case. */
export const ANNOTATE_COPY = {
  annotate: "Annotate",
  annotateHint: "Point at the page: click an element, Shift-click to add more, or drag a region. Esc to stop.",
  list: "Annotations",
  count: (n: number) => (n === 1 ? "1 annotation" : `${n} annotations`),
  marker: (n: number) => `Annotation ${n}`,
  comment: "Comment",
  commentHint: "What should change?",
  noComment: "No comment yet",
  done: "Done",
  delete: "Delete",
  details: "Details",
  screenshot: (n: number) => `Screenshot of annotation ${n}`,
  region: "Region",
  elements: (n: number) => (n === 1 ? "Element" : `${n} elements`),
  selector: "Selector",
  snippet: "HTML",
  styles: "Styles",
  viewport: "Viewport",
  url: "Address",
  source: "Source",
  consoleErrors: "Console errors",
  noErrors: "None",
  /** Closing the pane with unsent annotations asks first. */
  closeAsk: (n: number) => `Close the browser? ${n === 1 ? "Your annotation" : `Your ${n} annotations`} will be lost.`,
  closeAnyway: "Close and discard",
  keep: "Cancel",
} as const;

/** An element picked: how to find it again, its markup trimmed, and its key computed styles. */
export interface PickedElement {
  selector: string;
  tag: string;
  snippet: string;
  styles: Record<string, string>;
}

/** Where in the source the page's dev build says an element was made; best effort (React and Vite first). */
export interface SourceHint {
  file: string;
  line: number | null;
  column: number | null;
}

/** The page's viewport when it was annotated: its CSS size, pixel ratio, and the device shown, if any. */
export interface Viewport {
  width: number;
  height: number;
  dpr: number;
  device: string | null;
}

export interface Annotation {
  id: string;
  comment: string;
  /** One or more elements picked, or a region drawn. */
  kind: "elements" | "region";
  /** The elements picked; for a region, the element that holds it. */
  elements: PickedElement[];
  /** The region drawn, in the page's CSS px from the document's top left; null for elements. */
  region: Rect | null;
  url: string;
  viewport: Viewport;
  /** A PNG data URL of the elements or region as shown; null when none of it was in view. */
  screenshot: string | null;
  /** Console errors since the page loaded, oldest first. */
  consoleErrors: string[];
  source: SourceHint | null;
}

/** A pane's annotations as the main process last said: whether Annotate is on, the list, and the one being edited. */
export interface AnnotationsState {
  annotating: boolean;
  list: Annotation[];
  editing: string | null;
}

export const NO_ANNOTATIONS: AnnotationsState = { annotating: false, list: [], editing: null };

/** Limits on what is kept of the page's text: it is the page's, and may be anything. */
export const ANNOTATION_LIMITS = {
  selector: 500,
  snippet: 600,
  tag: 40,
  styles: 24,
  style: 200,
  url: 2000,
  comment: 10_000,
  errors: 20,
  error: 500,
  elements: 20,
  file: 500,
  device: 60,
} as const;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function readElement(raw: unknown): PickedElement | null {
  if (!isRecord(raw)) return null;
  const selector = text(raw.selector, ANNOTATION_LIMITS.selector);
  if (!selector) return null;
  const styles: Record<string, string> = {};
  if (isRecord(raw.styles)) {
    for (const [k, v] of Object.entries(raw.styles).slice(0, ANNOTATION_LIMITS.styles)) {
      if (typeof v === "string" && /^[a-z-]{1,40}$/.test(k)) styles[k] = v.slice(0, ANNOTATION_LIMITS.style);
    }
  }
  return {
    selector,
    tag: text(raw.tag, ANNOTATION_LIMITS.tag),
    snippet: text(raw.snippet, ANNOTATION_LIMITS.snippet),
    styles,
  };
}

export function readSource(raw: unknown): SourceHint | null {
  if (!isRecord(raw)) return null;
  const file = text(raw.file, ANNOTATION_LIMITS.file);
  const line = finite(raw.line);
  const column = finite(raw.column);
  return file
    ? {
        file,
        line: line && line > 0 ? Math.round(line) : null,
        column: column && column > 0 ? Math.round(column) : null,
      }
    : null;
}

function readAnnotation(raw: unknown): Annotation | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return null;
  const v = isRecord(raw.viewport) ? raw.viewport : {};
  const shot =
    typeof raw.screenshot === "string" && raw.screenshot.startsWith("data:image/png;base64,") ? raw.screenshot : null;
  return {
    id: raw.id.slice(0, 100),
    comment: text(raw.comment, ANNOTATION_LIMITS.comment),
    kind: raw.kind === "region" ? "region" : "elements",
    elements: (Array.isArray(raw.elements) ? raw.elements : [])
      .slice(0, ANNOTATION_LIMITS.elements)
      .map(readElement)
      .filter((e): e is PickedElement => e !== null),
    region: rectOf(raw.region),
    url: text(raw.url, ANNOTATION_LIMITS.url),
    viewport: {
      width: finite(v.width) ?? 0,
      height: finite(v.height) ?? 0,
      dpr: finite(v.dpr) ?? 1,
      device: typeof v.device === "string" && v.device ? v.device.slice(0, ANNOTATION_LIMITS.device) : null,
    },
    screenshot: shot,
    consoleErrors: (Array.isArray(raw.consoleErrors) ? raw.consoleErrors : [])
      .filter((e): e is string => typeof e === "string")
      .slice(-ANNOTATION_LIMITS.errors)
      .map((e) => e.slice(0, ANNOTATION_LIMITS.error)),
    source: readSource(raw.source),
  };
}

/** A pane's annotations from the host, read defensively. */
export function normalizeAnnotations(raw: unknown): AnnotationsState {
  const r = isRecord(raw) ? raw : {};
  const list = (Array.isArray(r.list) ? r.list : []).map(readAnnotation).filter((a): a is Annotation => a !== null);
  const editing = typeof r.editing === "string" && list.some((a) => a.id === r.editing) ? r.editing : null;
  return { annotating: r.annotating === true, list, editing };
}

/** The annotation half of the Browser pane's host contract (STORY-75). Each call names the pane by its key. */
export interface AnnotateBridge {
  /** Turns Annotate on or off in the pane's page. */
  annotate: (key: string, on: boolean) => void;
  /** Opens annotation `id` to edit, or none. */
  editAnnotation: (key: string, id: string | null) => void;
  comment: (key: string, id: string, text: string) => void;
  removeAnnotation: (key: string, id: string) => void;
  /** Calls back with a pane's annotations as they change; returns the unsubscribe. */
  onAnnotations: (listener: (key: string, state: AnnotationsState) => void) => () => void;
}

export const ANNOTATE_IPC = {
  browserAnnotate: "browser:annotate",
  browserAnnotationEdit: "browser:annotation-edit",
  browserAnnotationComment: "browser:annotation-comment",
  browserAnnotationRemove: "browser:annotation-remove",
  browserAnnotations: "browser:annotations",
} as const;

/** A browser tab has no page to annotate. */
export const noAnnotate = (): AnnotateBridge => ({
  annotate() {},
  editAnnotation() {},
  comment() {},
  removeAnnotation() {},
  onAnnotations: () => () => {},
});
