import { isRecord } from "@featra/work-format/guards";

/**
 * A world of Featra's own in the Browser pane's page (STORY-75, ADR 0048), over the Chrome DevTools Protocol on the
 * view's `webContents.debugger`. Its script runs in an isolated world of the page's main frame, in every document the
 * page loads: it shares the page's DOM but none of its JavaScript, so the page can't see or change it. It reports
 * through a binding exposed only to that world; a call from any other context is ignored, and what it reports is
 * still the page's renderer's word, which the caller checks. The page gets no Node, no preload and no IPC.
 */

/** What the world needs of Electron's `webContents.debugger`. */
export interface Cdp {
  isAttached: () => boolean;
  attach: (protocolVersion?: string) => void;
  sendCommand: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  on: (event: "message", listener: (event: unknown, method: string, params: unknown) => void) => unknown;
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
  log: (message: string) => void;
}

interface Context {
  name: string;
  frameId: string;
  isDefault: boolean;
}

const OBJECTS = "featra-annotate";
/** How long a call into the page may take: the page's own code may never return. */
export const PAGE_CALL_MS = 1500;

const record = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The page didn't answer in time.")), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

export function createPageWorld(dbg: Cdp, options: PageWorldOptions) {
  const { world, binding, source, onReport, log } = options;
  const contexts = new Map<number, Context>();
  // The world's context in the page now: the last that reported it is ready.
  let current: number | null = null;
  let started: Promise<void> | null = null;
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
    } else if (method === "Runtime.bindingCalled" && params.name === binding) {
      const id = params.executionContextId;
      // Only the world's own contexts have the binding; anything else calling it is ignored.
      if (typeof id !== "number" || contexts.get(id)?.name !== world || typeof params.payload !== "string") return;
      onReport(params.payload, id);
    }
  });

  return {
    /** Runs the world's script in the page now and in each document it loads; once. */
    start(): Promise<void> {
      started ??= (async () => {
        if (!dbg.isAttached()) dbg.attach("1.3");
        await send("Runtime.enable");
        await send("Page.enable");
        await send("Runtime.addBinding", { name: binding, executionContextName: world });
        await send("Page.addScriptToEvaluateOnNewDocument", { source, worldName: world });
        const tree = record(record(await send("Page.getFrameTree")).frameTree);
        const frameId = record(tree.frame).id;
        const made = record(await send("Page.createIsolatedWorld", { frameId, worldName: world }));
        await send("Runtime.evaluate", { expression: source, contextId: made.executionContextId });
      })().catch((err: unknown) => {
        started = null;
        log(`Annotate couldn't start in the page: ${err instanceof Error ? err.message : String(err)}`);
      });
      return started;
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
        log(`Annotate couldn't update the page: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    /**
     * Calls `fn` in the page's own world on the element `node` gives in this world, and returns its value as JSON
     * gives it: for what only the page's world has (a framework's dev-build fields). Null when anything fails.
     */
    async callOnNode(node: string, fn: string): Promise<unknown> {
      const here = current;
      const own = here === null ? undefined : contexts.get(here);
      const main = [...contexts].find(([, c]) => c.isDefault && own && c.frameId === own.frameId)?.[0];
      if (here === null || main === undefined) return null;
      try {
        return await within(
          (async () => {
            const found = record(
              record(await send("Runtime.evaluate", { expression: node, contextId: here, objectGroup: OBJECTS }))
                .result,
            );
            if (typeof found.objectId !== "string") return null;
            const described = record(record(await send("DOM.describeNode", { objectId: found.objectId })).node);
            const resolved = record(
              record(
                await send("DOM.resolveNode", {
                  backendNodeId: described.backendNodeId,
                  executionContextId: main,
                  objectGroup: OBJECTS,
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
        void send("Runtime.releaseObjectGroup", { objectGroup: OBJECTS }).catch(() => {});
      }
    },
  };
}

export type PageWorld = ReturnType<typeof createPageWorld>;
