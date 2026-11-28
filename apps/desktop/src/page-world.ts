import { isRecord } from "@featra/work-format/guards";

/**
 * A world of Featra's own in the Browser pane's page (STORY-75, ADR 0048), over the Chrome DevTools Protocol on the
 * view's `webContents.debugger`. Its script runs in an isolated world of the page's main frame, in every document the
 * page loads while it is started: it shares the page's DOM but none of its JavaScript, so the page can't see or change
 * it. It reports through a binding exposed only to that world; a call from any other context, or from a frame other
 * than the main one, is ignored, and what it reports is still the page's renderer's word, which the caller checks. The
 * page gets no Node, no preload and no IPC. Stopped, later documents get no script at all.
 */

/** What the world needs of Electron's `webContents.debugger`. */
export interface Cdp {
  isAttached: () => boolean;
  attach: (protocolVersion?: string) => void;
  sendCommand: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  on: {
    (event: "message", listener: (event: unknown, method: string, params: unknown) => void): unknown;
    (event: "detach", listener: (event: unknown, reason: string) => void): unknown;
  };
}

export interface PageWorldOptions {
  /** The world's name, which its contexts carry. */
  world: string;
  /** The binding's name: a function the world's script calls with a string. */
  binding: string;
  /** The script run in the world of each document. */
  source: string;
  /** A string the world's script reported, with the context it came from. */
  onReport: (payload: string, context: number) => void;
  /** The debugger let go of the page (DevTools opened on it, the page gone): the world is gone with it. */
  onDetach: () => void;
  log: (message: string) => void;
}

interface Context {
  name: string;
  frameId: string;
  isDefault: boolean;
}

/** How long a call into the page may take: the page's own code may never return. */
export const PAGE_CALL_MS = 1500;

const record = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The page didn't answer in time.")), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

export function createPageWorld(dbg: Cdp, options: PageWorldOptions) {
  const { world, binding, source, onReport, onDetach, log } = options;
  const contexts = new Map<number, Context>();
  // The world's context in the page now: the last that reported it is ready.
  let current: number | null = null;
  let mainFrame: string | null = null;
  let bound = false;
  // The script each new document runs, by the protocol's identifier, while started.
  let script: string | null = null;
  let running = false;
  // Starting and stopping, one at a time, in the order asked.
  let queue: Promise<void> = Promise.resolve();
  let groups = 0;
  const send = (method: string, params?: Record<string, unknown>) => dbg.sendCommand(method, params);

  dbg.on("message", (_event, method, raw) => {
    const params = record(raw);
    if (method === "Runtime.executionContextCreated") {
      const c = record(params.context);
      const aux = record(c.auxData);
      if (typeof c.id === "number")
        contexts.set(c.id, {
          name: typeof c.name === "string" ? c.name : "",
          frameId: typeof aux.frameId === "string" ? aux.frameId : "",
          isDefault: aux.isDefault === true,
        });
    } else if (method === "Runtime.executionContextDestroyed") {
      const id = params.executionContextId;
      if (typeof id === "number") contexts.delete(id);
      if (id === current) current = null;
    } else if (method === "Runtime.executionContextsCleared") {
      contexts.clear();
      current = null;
    } else if (method === "Page.frameNavigated") {
      const frame = record(params.frame);
      if (frame.parentId === undefined && typeof frame.id === "string") mainFrame = frame.id;
    } else if (method === "Runtime.bindingCalled" && params.name === binding) {
      const id = params.executionContextId;
      if (typeof id !== "number") return;
      const c = contexts.get(id);
      // Only the world's own contexts have the binding, and only the main frame's count; anything else is ignored.
      if (!c || c.name !== world || c.frameId !== mainFrame || typeof params.payload !== "string") return;
      onReport(params.payload, id);
    }
  });
  dbg.on("detach", () => {
    contexts.clear();
    current = null;
    mainFrame = null;
    bound = false;
    script = null;
    running = false;
    onDetach();
  });

  const queued = (step: () => Promise<void>) => {
    queue = queue.then(step);
    return queue;
  };

  return {
    /** Runs the world's script in the page now, and in each document it loads until stopped. */
    start(): Promise<void> {
      return queued(async () => {
        if (running) return;
        try {
          if (!dbg.isAttached()) dbg.attach("1.3");
          await send("Runtime.enable");
          await send("Page.enable");
          if (!bound) await send("Runtime.addBinding", { name: binding, executionContextName: world });
          bound = true;
          const added = record(await send("Page.addScriptToEvaluateOnNewDocument", { source, worldName: world }));
          script = typeof added.identifier === "string" ? added.identifier : null;
          running = true;
          // This document's world is there still, from before it was stopped: it needs no second overlay.
          if (current !== null) return;
          const tree = record(record(await send("Page.getFrameTree")).frameTree);
          const frameId = record(tree.frame).id;
          if (typeof frameId === "string") mainFrame = frameId;
          const made = record(await send("Page.createIsolatedWorld", { frameId, worldName: world }));
          await send("Runtime.evaluate", { expression: source, contextId: made.executionContextId });
        } catch (err) {
          running = false;
          log(`Annotate couldn't start in the page: ${message(err)}`);
        }
      });
    },
    /** Stops running the script in each new document, when `idle` still says so: later pages get no overlay. */
    stop(idle: () => boolean): Promise<void> {
      return queued(async () => {
        if (!running || !idle()) return;
        running = false;
        const id = script;
        script = null;
        if (id === null) return;
        try {
          await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: id });
        } catch (err) {
          log(`Annotate couldn't stop in the page: ${message(err)}`);
        }
      });
    },
    /** The world's context in the page now, as its script reported ready. */
    use(context: number) {
      current = context;
    },
    get current() {
      return current;
    },
    /** Runs `expression` in the world now; nothing while it has none. */
    async run(expression: string): Promise<void> {
      if (current === null) return;
      try {
        await within(send("Runtime.evaluate", { expression, contextId: current }), PAGE_CALL_MS);
      } catch (err) {
        log(`Annotate couldn't update the page: ${message(err)}`);
      }
    },
    /**
     * Calls `fn` in the page's own world on the element `node` gives in this world, and returns its value as JSON
     * gives it: for what only the page's world has (a framework's dev-build fields). Null when anything fails. Each
     * call holds its objects in a group of its own, so one call's release never frees another's.
     */
    async callOnNode(node: string, fn: string): Promise<unknown> {
      const here = current;
      const own = here === null ? undefined : contexts.get(here);
      const main = [...contexts].find(([, c]) => c.isDefault && own && c.frameId === own.frameId)?.[0];
      if (here === null || main === undefined) return null;
      const objectGroup = `${world}-${++groups}`;
      try {
        return await within(
          (async () => {
            const found = record(
              record(await send("Runtime.evaluate", { expression: node, contextId: here, objectGroup })).result,
            );
            if (typeof found.objectId !== "string") return null;
            const described = record(record(await send("DOM.describeNode", { objectId: found.objectId })).node);
            const resolved = record(
              record(
                await send("DOM.resolveNode", {
                  backendNodeId: described.backendNodeId,
                  executionContextId: main,
                  objectGroup,
                }),
              ).object,
            );
            if (typeof resolved.objectId !== "string") return null;
            const answer = record(
              await send("Runtime.callFunctionOn", {
                objectId: resolved.objectId,
                functionDeclaration: fn,
                returnByValue: true,
              }),
            );
            return record(answer.result).value ?? null;
          })(),
          PAGE_CALL_MS,
        );
      } catch {
        return null;
      } finally {
        void send("Runtime.releaseObjectGroup", { objectGroup }).catch(() => {});
      }
    },
  };
}

export type PageWorld = ReturnType<typeof createPageWorld>;
