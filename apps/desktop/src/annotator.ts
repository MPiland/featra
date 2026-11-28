import {
  ANNOTATION_LIMITS,
  createAnnotationsSender,
  OVERLAY_BINDING,
  OVERLAY_GLOBAL,
  OVERLAY_WORLD,
  overlaySource,
  parseSourceHint,
  readOverlayMessage,
  readSourceHintOnThis,
  type AnnotationsMessage,
  type Marker,
  type OverlayReport,
} from "@featra/client/annotate";
import type { Rect } from "@featra/client/bridge";
import { isRecord } from "@featra/work-format/guards";
import { createAnnotations, type Annotations } from "./annotations.ts";
import { inView } from "./page-capture.ts";
import { createPageWorld, type Cdp } from "./page-world.ts";

export { inView } from "./page-capture.ts";

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
  /** A PNG data URL of `rect` of the page as shown, in the page's CSS px; null when it gives none. */
  capture: (rect: Rect) => Promise<string | null>;
  /** The device the page is shown as, by name; null when it fits the pane. */
  device: () => string | null;
  /** Tells the window the pane's annotations, each screenshot once (annotations-wire.ts). */
  send: (message: AnnotationsMessage) => void;
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

/** How long a comment rests before the window is told it: the window has it already, as typed. */
export const TYPED_MS = 300;

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
  // Whether the user wants Annotate on, as last asked: what holds once a start they asked for before has finished.
  let wanted = false;
  // Picks still being captured: each will be an annotation in a moment.
  let pending = 0;
  /** Nothing to show in the page: Annotate off, and no annotation or pick to mark. */
  const idle = () => !wanted && !store.annotating && pending === 0 && store.list().length === 0;
  const toWindow = createAnnotationsSender();
  let typing: ReturnType<typeof setTimeout> | undefined;
  const tell = () => {
    clearTimeout(typing);
    typing = undefined;
    deps.send(toWindow(store.state()));
  };
  const store: Annotations = createAnnotations((_state, typed) => {
    // A comment typed is the window's own already: it is told once the typing rests, and at once on any other change.
    if (typed) typing ??= setTimeout(tell, TYPED_MS);
    else tell();
    void sync();
    if (idle()) void world.stop(idle);
  });

  const shot = async (rect: Rect, viewport: { width: number; height: number }) => {
    const area = inView(rect, viewport);
    if (!area) return null;
    try {
      return await deps.capture(area);
    } catch (err) {
      log(`Annotate couldn't capture the page: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };
  const sourceOf = async (ref: number) =>
    parseSourceHint(await world.callOnNode(`${OVERLAY_GLOBAL}.node(${ref})`, readSourceHintOnThis()));

  async function capture(report: Extract<OverlayReport, { type: "pick" | "region" }>) {
    const screenshot = await shot(report.rect, report.viewport);
    const open = store.editing ? store.list().find((a) => a.id === store.editing) : undefined;
    // Shift adds to the annotation open when it is of elements on this page; on another page it is one of its own.
    const here = open !== undefined && withoutHash(open.url) === withoutHash(page.getURL());
    if (report.type === "pick" && report.add && open?.kind === "elements" && here) {
      store.addElement(open.id, report.element, report.ref, screenshot);
      return;
    }
    const region =
      report.type === "region"
        ? { ...report.rect, x: report.rect.x + report.scroll.x, y: report.rect.y + report.scroll.y }
        : null;
    const { element, ref } = report;
    const added = store.add(
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
    if (added === null) log(`Annotate keeps ${ANNOTATION_LIMITS.annotations} annotations at most.`);
  }

  async function picked(report: Extract<OverlayReport, { type: "pick" | "region" }>) {
    pending++;
    store.setCapturing(true);
    try {
      await capture(report);
    } finally {
      pending--;
      if (pending === 0) store.setCapturing(false);
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
    onDetach() {
      wanted = false;
      synced = "";
      store.setAnnotating(false);
    },
  });

  return {
    state: store.state,
    /**
     * Turns Annotate on or off; the overlay starts in the page when it is turned on. What was asked last holds: off
     * asked while on is still starting leaves it off.
     */
    async annotate(on: boolean) {
      wanted = on;
      if (on) await world.start();
      store.setAnnotating(wanted);
      if (idle()) void world.stop(idle);
    },
    edit: (id: string | null) => store.edit(id),
    comment: (id: string, text: string) => store.comment(id, text),
    remove: (id: string) => store.remove(id),
    /** Escape in the page: leaves Annotate when it is on; false when it isn't, so Escape does what it otherwise does. */
    escape(): boolean {
      if (!store.annotating) return false;
      wanted = false;
      store.setAnnotating(false);
      return true;
    },
    /** For STORY-40's tools: the list. */
    list: () => store.list(),
    /** For STORY-76's Send: the list, cleared in the same step, so nothing added between is lost. */
    take: () => store.take(),
  };
}

export type Annotator = ReturnType<typeof createAnnotator>;
