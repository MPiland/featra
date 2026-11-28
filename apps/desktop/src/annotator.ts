import {
  ANNOTATION_LIMITS,
  OVERLAY_BINDING,
  OVERLAY_GLOBAL,
  OVERLAY_WORLD,
  overlaySource,
  parseSourceHint,
  readOverlayMessage,
  readSourceHintOnThis,
  type AnnotationsState,
  type Marker,
  type OverlayReport,
} from "@featra/client/annotate";
import type { Rect } from "@featra/client/bridge";
import { isRecord } from "@featra/work-format/guards";
import { createAnnotations, type Annotations } from "./annotations.ts";
import { createPageWorld, type Cdp } from "./page-world.ts";

/** What the annotator needs of a pane's page. */
export interface AnnotatedPage {
  getURL: () => string;
  /** Calls `listener` with each console message's arguments, as Electron gives them. */
  onConsole: (listener: (...args: unknown[]) => void) => void;
  /** Calls `listener` when the page loads a new document. */
  onNavigate: (listener: () => void) => void;
  debugger: Cdp;
}

export interface AnnotatorDeps {
  page: AnnotatedPage;
  /** A screenshot of `rect` of the page as shown, in the page's CSS px. */
  capture: (rect: Rect) => Promise<{ isEmpty: () => boolean; toDataURL: () => string }>;
  /** The device the page is shown as, by name; null when it fits the pane. */
  device: () => string | null;
  /** Tells the window the pane's annotations. */
  send: (state: AnnotationsState) => void;
  /** Gives the window the keyboard, to type the comment. */
  focusWindow: () => void;
  log: (message: string) => void;
}

/** A console message as Electron gives it: an event with its level (Electron 35 on), or the older arguments. */
function consoleError(args: unknown[]): string | null {
  const [event, oldLevel, oldMessage, oldLine, oldSource] = args;
  const e: Record<string, unknown> = isRecord(event) ? event : {};
  const level = e.level ?? oldLevel;
  if (level !== "error" && level !== 3) return null;
  const message = typeof e.message === "string" ? e.message : typeof oldMessage === "string" ? oldMessage : "";
  const source = typeof e.sourceId === "string" ? e.sourceId : typeof oldSource === "string" ? oldSource : "";
  const line = typeof e.lineNumber === "number" ? e.lineNumber : typeof oldLine === "number" ? oldLine : 0;
  const at = source ? ` (${source}${line ? `:${line}` : ""})` : "";
  return `${message}${at}`.slice(0, ANNOTATION_LIMITS.error);
}

const withoutHash = (url: string) => url.split("#")[0] ?? url;

/** `rect` within the viewport, whole pixels; null when none of it is in view. */
export function inView(rect: Rect, viewport: { width: number; height: number }): Rect | null {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(viewport.width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(viewport.height, Math.ceil(rect.y + rect.height));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

/**
 * Annotate in one Browser pane's page (STORY-75, ADR 0048): the overlay in Featra's own world of the page, the
 * annotations it makes (`annotations.ts`, their one owner), and what each captures: a screenshot of the elements or
 * region, the viewport and device, the URL, the elements' selectors, markup and styles, console errors since the page
 * loaded, and the source-file hint. All of it is read from the page and the view; no model is asked, so capturing
 * costs no tokens.
 */
export function createAnnotator(deps: AnnotatorDeps) {
  const { page, log } = deps;
  let errors: string[] = [];
  let synced = "";
  page.onConsole((...args) => {
    const error = consoleError(args);
    if (error !== null) errors = [...errors, error].slice(-ANNOTATION_LIMITS.errors);
  });
  // A new document: its console starts again.
  page.onNavigate(() => {
    errors = [];
  });

  const markers = (): Marker[] =>
    store.placed().map((a) => ({
      id: a.id,
      n: a.n,
      refs: a.refs,
      selectors: a.elements.map((e) => e.selector),
      region: a.region,
      url: withoutHash(a.url),
      active: a.id === store.editing,
    }));
  const sync = (force = false) => {
    const expression = `${OVERLAY_GLOBAL}.mode(${store.annotating});${OVERLAY_GLOBAL}.sync(${JSON.stringify(markers())});`;
    if (expression === synced && !force) return Promise.resolve();
    synced = expression;
    return world.run(expression);
  };
  const store: Annotations = createAnnotations((state) => {
    deps.send(state);
    void sync();
  });

  const shot = async (rect: Rect, viewport: { width: number; height: number }) => {
    const area = inView(rect, viewport);
    if (!area) return null;
    try {
      const image = await deps.capture(area);
      return image.isEmpty() ? null : image.toDataURL();
    } catch (err) {
      log(`Annotate couldn't capture the page: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };
  const sourceOf = async (ref: number) =>
    parseSourceHint(await world.callOnNode(`${OVERLAY_GLOBAL}.node(${ref})`, readSourceHintOnThis()));

  async function picked(report: Extract<OverlayReport, { type: "pick" | "region" }>) {
    const screenshot = await shot(report.rect, report.viewport);
    const open = store.editing ? store.list().find((a) => a.id === store.editing) : undefined;
    if (report.type === "pick" && report.add && open?.kind === "elements") {
      store.addElement(open.id, report.element, report.ref, screenshot);
    } else {
      const region =
        report.type === "region"
          ? { ...report.rect, x: report.rect.x + report.scroll.x, y: report.rect.y + report.scroll.y }
          : null;
      const element = report.element;
      const ref = report.ref;
      store.add(
        {
          kind: region ? "region" : "elements",
          elements: element ? [element] : [],
          region,
          url: page.getURL().slice(0, ANNOTATION_LIMITS.url),
          viewport: { ...report.viewport, device: deps.device() },
          screenshot,
          consoleErrors: errors,
          source: ref ? await sourceOf(ref) : null,
        },
        ref ? [ref] : [],
      );
    }
    // Whatever the pick changed, the overlay shows again.
    await sync(true);
    deps.focusWindow();
  }

  const world = createPageWorld(page.debugger, {
    world: OVERLAY_WORLD,
    binding: OVERLAY_BINDING,
    source: overlaySource(),
    log,
    onReport(payload, context) {
      const report = readOverlayMessage(payload);
      if (!report) return;
      if (report.type === "ready") {
        world.use(context);
        void sync(true);
      } else if (context !== world.current) return;
      else if (report.type === "open") {
        store.edit(report.id);
        deps.focusWindow();
      } else void picked(report);
    },
  });

  return {
    state: store.state,
    /** Turns Annotate on or off; the overlay starts in the page the first time. */
    async annotate(on: boolean) {
      if (on) await world.start();
      store.setAnnotating(on);
    },
    edit: (id: string | null) => store.edit(id),
    comment: (id: string, text: string) => store.comment(id, text),
    remove: (id: string) => store.remove(id),
    /** Escape in the page: leaves Annotate when it is on; false when it isn't, so Escape does what it otherwise does. */
    escape(): boolean {
      if (!store.annotating) return false;
      store.setAnnotating(false);
      return true;
    },
    /** For STORY-76's Send and STORY-40's tools: the list, and clearing it once sent. */
    list: () => store.list(),
    clear: () => store.clear(),
  };
}

export type Annotator = ReturnType<typeof createAnnotator>;
