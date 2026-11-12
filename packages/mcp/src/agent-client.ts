import {
  isRecord,
  LOG_FILES,
  parseDraftResult,
  parseResponse,
  type AgentMethod,
  type AgentMethods,
} from "@featra/work-format";
import type { FeatraHost } from "./tools.ts";

/** The part of a WebSocket the client uses, so a test can stand in for the socket. */
export type AgentSocket = Pick<WebSocket, "send" | "close" | "addEventListener">;

export interface AgentClient extends FeatraHost {
  close: () => void;
}

/** Waits for the socket to open, or fails when it can't. */
function opened(socket: AgentSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const unreachable = () => reject(new Error("Featra isn't reachable."));
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", unreachable);
    socket.addEventListener("close", unreachable);
  });
}

/**
 * Connects to Featra's agent socket (ADR 0019) and returns the host the tools use. `url` carries the chat's secret as
 * `token`; the server decides which chat that is, so nothing here says.
 */
export async function connectAgent(url: string, token: string, open = defaultSocket): Promise<AgentClient> {
  const socket = open(`${url}?token=${encodeURIComponent(token)}`);
  await opened(socket);

  let next = 1;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const failAll = (message: string) => {
    for (const waiter of pending.values()) waiter.reject(new Error(message));
    pending.clear();
  };
  socket.addEventListener("close", () => failAll("Featra went away."));
  socket.addEventListener("error", () => failAll("Featra went away."));
  socket.addEventListener("message", ({ data }) => {
    const response = typeof data === "string" ? parseResponse(data) : null;
    if (!response || typeof response.id !== "number") return;
    const waiter = pending.get(response.id);
    if (!waiter) return;
    pending.delete(response.id);
    if (response.ok) waiter.resolve(response.result);
    else waiter.reject(new Error(response.error));
  });

  function call<M extends AgentMethod>(method: M, params: AgentMethods[M]["params"]): Promise<unknown> {
    const id = next++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  return {
    async log(input) {
      const result = await call("log.append", input);
      const file = isRecord(result) ? Object.values(LOG_FILES).find((f) => f === result.file) : undefined;
      if (!isRecord(result) || typeof result.entry !== "string" || !file) {
        throw new Error("Featra gave an unexpected answer.");
      }
      return { entry: result.entry, file };
    },
    async draft(input) {
      const result = parseDraftResult(await call("cards.draft", input));
      if (!result) throw new Error("Featra gave an unexpected answer.");
      return result;
    },
    async start(feature) {
      const result = await call("feature.start", { feature });
      if (!isRecord(result) || typeof result.branch !== "string") throw new Error("Featra gave an unexpected answer.");
      return { branch: result.branch };
    },
    async spawn(input) {
      const result = await call("story.spawn", input);
      if (!isRecord(result) || typeof result.chat !== "string" || typeof result.queued !== "boolean") {
        throw new Error("Featra gave an unexpected answer.");
      }
      return { chat: result.chat, queued: result.queued };
    },
    async update(input) {
      const result = await call("card.update", input);
      const changes = isRecord(result) && Array.isArray(result.changes) ? result.changes : null;
      if (
        !isRecord(result) ||
        typeof result.card !== "string" ||
        !changes ||
        !changes.every((c) => typeof c === "string")
      ) {
        throw new Error("Featra gave an unexpected answer.");
      }
      return { card: result.card, changes: changes.map(String) };
    },
    async message(input) {
      const result = await call("session.message", input);
      if (!isRecord(result) || typeof result.story !== "string") throw new Error("Featra gave an unexpected answer.");
      return { story: result.story };
    },
    async propose(input) {
      const result = await call("checks.propose", input);
      const proposed = isRecord(result) && Array.isArray(result.proposed) ? result.proposed.map(String) : null;
      if (!proposed) throw new Error("Featra gave an unexpected answer.");
      return { proposed };
    },
    close: () => socket.close(),
  };
}

const defaultSocket = (url: string): AgentSocket => new WebSocket(url);
