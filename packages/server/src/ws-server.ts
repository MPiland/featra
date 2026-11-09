import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  AGENT_PATH,
  errorMessage,
  parseAgentRequest,
  parseRequest,
  SERVER_HOST,
  SERVER_PATH,
  type AgentMethod,
  type ServerResponse,
} from "@featra/work-format";
import { ApiError, type Api, type Connection } from "./api.ts";

/** The agent socket (ADR 0019): which chat a secret opens, and what a chat's MCP process may ask. */
export interface AgentSockets {
  resolve: (token: string) => string | null;
  call: (chat: string, method: AgentMethod, params: unknown) => Promise<unknown>;
}

export interface ServerOptions {
  /** The secret every connection must present (`?token=`): only Featra's own window has it. */
  token: string;
  api: Api;
  /** The narrow socket agents' MCP processes use; without it there is none. */
  agents?: AgentSockets;
  /** Logs a line in the host's log: failures only, never params or tokens. */
  log: (message: string) => void;
  /** 0 (the default) lets the OS pick a free port. */
  port?: number;
}

export interface RunningServer {
  port: number;
  /** `ws://127.0.0.1:<port>/v1`, without the token. */
  url: string;
  close: () => Promise<void>;
}

const MAX_FRAME_BYTES = 1024 * 1024;

const sameSecret = (given: string, token: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
};

function authorised(req: IncomingMessage, token: string, agents?: AgentSockets): boolean {
  return agentChat(req, agents) !== null || windowConnection(req, token);
}

const urlOf = (req: IncomingMessage) => new URL(req.url ?? "/", `http://${SERVER_HOST}`);

/** Featra's own window: the server's secret, on the window's path. */
function windowConnection(req: IncomingMessage, token: string): boolean {
  const url = urlOf(req);
  return url.pathname === SERVER_PATH && sameSecret(url.searchParams.get("token") ?? "", token);
}

/** The chat an agent's connection belongs to: the secret its MCP process was given, on the agent path. */
function agentChat(req: IncomingMessage, agents?: AgentSockets): string | null {
  const url = urlOf(req);
  return agents && url.pathname === AGENT_PATH ? agents.resolve(url.searchParams.get("token") ?? "") : null;
}

function frameText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.isBuffer(data) ? data.toString("utf8") : new TextDecoder().decode(data);
}

/** The connection a socket's requests act through: its pushes, and the watches that end when it closes. */
function connect(socket: WebSocket): { connection: Connection; closeAll: () => void } {
  const kept = new Map<number, () => void>();
  const unwatch = (id: number) => {
    const stop = kept.get(id);
    kept.delete(id);
    stop?.();
    return Boolean(stop);
  };
  return {
    connection: {
      push(event, watch, data) {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ event, watch, data }));
      },
      keep(id, stop) {
        unwatch(id);
        if (socket.readyState === socket.OPEN) kept.set(id, stop);
        else stop();
      },
      unwatch,
    },
    closeAll: () => {
      for (const id of kept.keys()) unwatch(id);
    },
  };
}

/** An agent's request, answered on its socket: the chat is the connection's, and the method one it may call. */
async function answerAgent(socket: WebSocket, chat: string, agent: AgentSockets, text: string) {
  const request = parseAgentRequest(text);
  if ("error" in request) {
    if (request.id !== null) socket.send(JSON.stringify({ id: request.id, ok: false, error: request.error }));
    return;
  }
  const response: ServerResponse = await agent.call(chat, request.method, request.params).then(
    (result) => ({ id: request.id, ok: true, result }),
    (err: unknown) => ({ id: request.id, ok: false, error: errorMessage(err) }),
  );
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(response));
}

/**
 * Starts the WebSocket API (ADR 0015) on 127.0.0.1. Each request is answered on the socket it came in on; a watch
 * pushes `{ event, watch, data }` frames on it (ADR 0016) and ends when the socket closes.
 */
export function startServer({ token, api, agents, log, port = 0 }: ServerOptions): Promise<RunningServer> {
  if (!token) return Promise.reject(new Error("The server needs a token."));
  const wss = new WebSocketServer({
    host: SERVER_HOST,
    port,
    maxPayload: MAX_FRAME_BYTES,
    verifyClient: ({ req }: { req: IncomingMessage }) => authorised(req, token, agents),
  });

  const answer = async (socket: WebSocket, connection: Connection, text: string) => {
    const request = parseRequest(text);
    let response: ServerResponse;
    if ("error" in request) {
      if (request.id === null) return; // nothing to answer to
      response = { id: request.id, ok: false, error: request.error };
    } else {
      try {
        response = {
          id: request.id,
          ok: true,
          result: await api(request.method, request.params, request.id, connection),
        };
      } catch (err) {
        if (!(err instanceof ApiError)) log(`${request.method} failed: ${errorMessage(err)}`);
        response = { id: request.id, ok: false, error: errorMessage(err) };
      }
    }
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(response));
  };

  wss.on("connection", (socket, req) => {
    const chat = agentChat(req, agents);
    if (agents && chat !== null) {
      socket.on("message", (data, isBinary) => {
        if (isBinary) return socket.close(1003, "Text frames only.");
        void answerAgent(socket, chat, agents, frameText(data));
      });
      socket.on("error", (err) => log(`Socket error: ${err.message}`));
      return;
    }
    const { connection, closeAll } = connect(socket);
    socket.on("close", closeAll);
    socket.on("message", (data, isBinary) => {
      if (isBinary) return socket.close(1003, "Text frames only.");
      void answer(socket, connection, frameText(data));
    });
    socket.on("error", (err) => log(`Socket error: ${err.message}`));
  });

  return new Promise((resolve, reject) => {
    wss.once("error", reject);
    wss.once("listening", () => {
      wss.off("error", reject);
      wss.on("error", (err) => log(`Server error: ${err.message}`));
      const address = wss.address();
      const bound = typeof address === "object" && address ? address.port : port;
      resolve({
        port: bound,
        url: `ws://${SERVER_HOST}:${bound}${SERVER_PATH}`,
        close: () =>
          new Promise<void>((done) => {
            for (const client of wss.clients) client.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}
