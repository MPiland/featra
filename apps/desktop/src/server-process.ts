import { fork, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { ServerEndpoint } from "@featra/client/bridge";
import { parseServerMessage, type HostMessage } from "@featra/server/host-messages";
import { SERVER_HOST, SERVER_PATH } from "@featra/work-format";

/**
 * The local server as a child process (ADR 0015). Free of Electron imports: main passes Electron's own executable,
 * which runs the server as plain Node with `ELECTRON_RUN_AS_NODE=1`. Started on first use; if it exits, the next use
 * starts it again with a new token and the last project list.
 */
export interface ServerProcess {
  /** Where the page connects, once the server listens; null when it can't start (the reason is logged). */
  endpoint: () => Promise<ServerEndpoint | null>;
  /** The folders the page may act on. Resolves once the server has the list. */
  setProjects: (dirs: string[]) => Promise<void>;
  stop: () => void;
}

export interface ServerProcessDeps {
  /** The bundled server (`dist/server.cjs`), or its source in tests. */
  script: string;
  /** The runtime: Electron's executable in the app, Node in tests. */
  execPath: string;
  log: (message: string) => void;
}

const START_TIMEOUT_MS = 15_000;

const send = (child: ChildProcess, message: HostMessage) => child.connected && child.send(message);

interface Running {
  child: ChildProcess;
  ready: Promise<ServerEndpoint | null>;
}

export function createServerProcess({ script, execPath, log }: ServerProcessDeps): ServerProcess {
  let running: Running | null = null;
  let dirs: string[] = [];
  let seq = 0;
  const acks = new Map<number, () => void>();

  function start(): Running {
    const token = randomBytes(32).toString("base64url");
    const child = fork(script, [], {
      execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      serialization: "json",
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (text: string) => log(`Server: ${text.trim()}`));
    const ready = new Promise<ServerEndpoint | null>((resolve) => {
      const timer = setTimeout(() => {
        log("Server didn't start in time");
        resolve(null);
      }, START_TIMEOUT_MS);
      const done = (endpoint: ServerEndpoint | null) => {
        clearTimeout(timer);
        resolve(endpoint);
      };
      child.on("message", (raw) => {
        const message = parseServerMessage(raw);
        if (!message) return log("Server: ignored a malformed message");
        switch (message.type) {
          case "listening":
            log(`Server listening on ${SERVER_HOST}:${message.port}`);
            return done({ url: `ws://${SERVER_HOST}:${message.port}${SERVER_PATH}`, token });
          case "failed":
            log(`Server failed to start: ${message.error}`);
            return done(null);
          case "projects-ack":
            acks.get(message.seq)?.();
            acks.delete(message.seq);
            return;
          case "log":
            return log(`Server: ${message.message}`);
          default:
            return message satisfies never;
        }
      });
      child.once("error", (err) => {
        log(`Server process error: ${err.message}`);
        done(null);
      });
      child.once("exit", (code, signal) => {
        if (running?.child === child) running = null;
        for (const ack of acks.values()) ack(); // nothing to wait for: a new server gets the list when it starts
        acks.clear();
        log(`Server stopped (${signal ?? `exit code ${code}`})`);
        done(null);
      });
    });
    send(child, { type: "start", token });
    void sendProjects(child);
    return { child, ready };
  }

  function sendProjects(child: ChildProcess): Promise<void> {
    const n = ++seq;
    return new Promise<void>((resolve) => {
      acks.set(n, resolve);
      if (!send(child, { type: "projects", seq: n, dirs })) {
        acks.delete(n);
        resolve();
      }
    });
  }

  const current = () => (running ??= start());

  return {
    endpoint: () => current().ready,
    setProjects(next) {
      dirs = [...next];
      return sendProjects(current().child);
    },
    stop() {
      const child = running?.child;
      running = null;
      // Closing the IPC channel tells the server to close its sockets and exit.
      if (child?.connected) child.disconnect();
    },
  };
}
