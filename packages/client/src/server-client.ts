/**
 * The client end of the local server's WebSocket API (ADR 0015). Pure browser code: the Electron preload builds the
 * bridge's server-backed methods from it, and a remote client (M2) can do the same with its own endpoint.
 */
import { isRecord } from "@featra/work-format/guards";
import { parsePush, parseResponse, type ServerMethod, type ServerMethods } from "@featra/work-format/protocol";

/** Where the server listens and the secret it asks for. The host hands it out; it changes when the server restarts. */
export interface ServerEndpoint {
  url: string;
  token: string;
}

export function normalizeEndpoint(raw: unknown): ServerEndpoint | null {
  const r = isRecord(raw) ? raw : {};
  if (typeof r.url !== "string" || !/^wss?:\/\//.test(r.url) || typeof r.token !== "string" || !r.token) return null;
  return { url: r.url, token: r.token };
}

/** Hears a watch: each new value (the answer, then every push), or why it can't be had right now. */
export interface WatchListener {
  data: (data: unknown) => void;
  error: (message: string) => void;
}

export interface ServerClient {
  /** Sends one request; resolves with the raw result for the caller to check, or rejects with the server's error. */
  call: <M extends ServerMethod>(method: M, params: ServerMethods[M]["params"]) => Promise<unknown>;
  /**
   * Starts a `work.watch` (ADR 0016), a `card.watch` (ADR 0017) or a `chat.watch` (ADR 0018): the listener hears the answer, then every push
   * for it. When the connection drops, the listener hears why, and the watch starts again on a new connection.
   * Returns the stop.
   */
  watch: <M extends WatchMethod>(method: M, params: ServerMethods[M]["params"], listener: WatchListener) => () => void;
  close: () => void;
}

/** The methods that start a watch: its pushes go on until `work.unwatch`. */
export type WatchMethod = "work.watch" | "card.watch" | "chat.watch";

/** How long a dropped watch waits before it tries again. */
export const REWATCH_MS = 1000;

export const SERVER_UNAVAILABLE = "Featra's local server isn't running. Restart Featra, then try again.";
export const SERVER_LOST = "Lost the connection to Featra's local server. Try again.";

/** The parts of the browser's WebSocket the client uses, so tests can hand in Node's. */
type SocketLike = Pick<WebSocket, "send" | "close" | "addEventListener" | "readyState">;
export type SocketFactory = (url: string) => SocketLike;

interface Pending {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

interface Watch {
  method: WatchMethod;
  params: unknown;
  listener: WatchListener;
  /** The id of the request that started it on the current connection; null while it isn't running. */
  id: number | null;
  retry: ReturnType<typeof setTimeout> | undefined;
  stopped: boolean;
}

/**
 * Connects on the first call and keeps the socket open. If it closes, pending calls fail and the next call asks the
 * host for the endpoint again, so a restarted server is picked up.
 */
export function createServerClient(
  endpoint: () => Promise<ServerEndpoint | null>,
  open: SocketFactory = (url) => new WebSocket(url),
): ServerClient {
  let socket: Promise<SocketLike> | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const watches = new Set<Watch>();
  const byId = new Map<number, Watch>();

  const failAll = (message: string) => {
    for (const p of pending.values()) p.reject(new Error(message));
    pending.clear();
  };

  const connect = async (): Promise<SocketLike> => {
    const where = await endpoint();
    if (!where) throw new Error(SERVER_UNAVAILABLE);
    const ws = open(`${where.url}?token=${encodeURIComponent(where.token)}`);
    return new Promise((resolve, reject) => {
      ws.addEventListener("open", () => resolve(ws), { once: true });
      ws.addEventListener("error", () => reject(new Error(SERVER_UNAVAILABLE)), { once: true });
      ws.addEventListener("close", () => {
        socket = null;
        failAll(SERVER_LOST);
        byId.clear();
        for (const w of watches) dropped(w, SERVER_LOST);
      });
      ws.addEventListener("message", (e) => {
        if (typeof e.data !== "string") return;
        const push = parsePush(e.data);
        if (push) {
          const w = byId.get(push.watch);
          if (w && !w.stopped) w.listener.data(push.data);
          return;
        }
        const response = parseResponse(e.data);
        const waiting = response ? pending.get(response.id) : undefined;
        if (!response || !waiting) return;
        pending.delete(response.id);
        if (response.ok) waiting.resolve(response.result);
        else waiting.reject(new Error(response.error));
      });
    });
  };

  /** Sends a request; `started` hears its id before the frame goes, so a push that beats the answer is routed. */
  const send = async (method: ServerMethod, params: unknown, started?: (id: number) => void): Promise<unknown> => {
    socket ??= connect().catch((err: unknown) => {
      socket = null;
      throw err;
    });
    const ws = await socket;
    const id = nextId++;
    started?.(id);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  function start(w: Watch) {
    w.retry = undefined;
    if (w.stopped) return;
    void send(w.method, w.params, (id) => {
      w.id = id;
      byId.set(id, w);
    }).then(
      (data) => {
        if (w.stopped) return;
        w.listener.data(data);
      },
      (err: unknown) => {
        if (w.id !== null) byId.delete(w.id);
        dropped(w, err instanceof Error ? err.message : SERVER_LOST);
      },
    );
  }

  function dropped(w: Watch, message: string) {
    w.id = null;
    if (w.stopped || w.retry) return;
    w.listener.error(message);
    w.retry = setTimeout(() => start(w), REWATCH_MS);
  }

  return {
    call: (method, params) => send(method, params),
    watch(method, params, listener) {
      const w: Watch = { method, params, listener, id: null, retry: undefined, stopped: false };
      watches.add(w);
      start(w);
      return () => {
        w.stopped = true;
        clearTimeout(w.retry);
        watches.delete(w);
        if (w.id === null) return;
        byId.delete(w.id);
        const watch = w.id;
        w.id = null;
        if (socket) void send("work.unwatch", { watch }).catch(() => {});
      };
    },
    close() {
      for (const w of watches) {
        w.stopped = true;
        clearTimeout(w.retry);
      }
      watches.clear();
      byId.clear();
      // A connect that failed has already rejected its call; there is nothing left to close.
      void socket?.then((ws) => ws.close()).catch(() => {});
      socket = null;
      failAll(SERVER_LOST);
    },
  };
}
