import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { errorMessage, parseRequest, SERVER_HOST, SERVER_PATH, type ServerResponse } from "@featra/work-format";
import { ApiError, type Api } from "./api.ts";

export interface ServerOptions {
  /** The secret every connection must present (`?token=`): only Featra's own window has it. */
  token: string;
  api: Api;
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

function authorised(req: IncomingMessage, token: string): boolean {
  const url = new URL(req.url ?? "/", `http://${SERVER_HOST}`);
  return url.pathname === SERVER_PATH && sameSecret(url.searchParams.get("token") ?? "", token);
}

function frameText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.isBuffer(data) ? data.toString("utf8") : new TextDecoder().decode(data);
}

/** Starts the WebSocket API (ADR 0015) on 127.0.0.1. Each request is answered on the socket it came in on. */
export function startServer({ token, api, log, port = 0 }: ServerOptions): Promise<RunningServer> {
  if (!token) return Promise.reject(new Error("The server needs a token."));
  const wss = new WebSocketServer({
    host: SERVER_HOST,
    port,
    maxPayload: MAX_FRAME_BYTES,
    verifyClient: ({ req }: { req: IncomingMessage }) => authorised(req, token),
  });

  const answer = async (socket: WebSocket, text: string) => {
    const request = parseRequest(text);
    let response: ServerResponse;
    if ("error" in request) {
      if (request.id === null) return; // nothing to answer to
      response = { id: request.id, ok: false, error: request.error };
    } else {
      try {
        response = { id: request.id, ok: true, result: await api(request.method, request.params) };
      } catch (err) {
        if (!(err instanceof ApiError)) log(`${request.method} failed: ${errorMessage(err)}`);
        response = { id: request.id, ok: false, error: errorMessage(err) };
      }
    }
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(response));
  };

  wss.on("connection", (socket) => {
    socket.on("message", (data, isBinary) => {
      if (isBinary) return socket.close(1003, "Text frames only.");
      void answer(socket, frameText(data));
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
