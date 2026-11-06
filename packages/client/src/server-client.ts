/**
 * The client end of the local server's WebSocket API (ADR 0015). Pure browser code: the Electron preload builds the
 * bridge's server-backed methods from it, and a remote client (M2) can do the same with its own endpoint.
 */
import { isRecord } from "@featra/work-format/guards";
import { parseResponse, type ServerMethod, type ServerMethods } from "@featra/work-format/protocol";

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

export interface ServerClient {
  /** Sends one request; resolves with the raw result for the caller to check, or rejects with the server's error. */
  call: <M extends ServerMethod>(method: M, params: ServerMethods[M]["params"]) => Promise<unknown>;
  close: () => void;
}

export const SERVER_UNAVAILABLE = "Featra's local server isn't running. Restart Featra, then try again.";
export const SERVER_LOST = "Lost the connection to Featra's local server. Try again.";

/** The parts of the browser's WebSocket the client uses, so tests can hand in Node's. */
type SocketLike = Pick<WebSocket, "send" | "close" | "addEventListener" | "readyState">;
export type SocketFactory = (url: string) => SocketLike;

interface Pending {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
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
      });
      ws.addEventListener("message", (e) => {
        const response = typeof e.data === "string" ? parseResponse(e.data) : null;
        const waiting = response ? pending.get(response.id) : undefined;
        if (!response || !waiting) return;
        pending.delete(response.id);
        if (response.ok) waiting.resolve(response.result);
        else waiting.reject(new Error(response.error));
      });
    });
  };

  return {
    async call(method, params) {
      socket ??= connect().catch((err: unknown) => {
        socket = null;
        throw err;
      });
      const ws = await socket;
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      // A connect that failed has already rejected its call; there is nothing left to close.
      void socket?.then((ws) => ws.close()).catch(() => {});
      socket = null;
      failAll(SERVER_LOST);
    },
  };
}
