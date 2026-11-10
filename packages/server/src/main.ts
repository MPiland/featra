/**
 * The server process (ADR 0015). The desktop host forks it on Electron's own Node (`ELECTRON_RUN_AS_NODE=1`) with an
 * IPC channel, sends `start` with the token, and keeps the open-project list current. When the host goes, so does
 * the server.
 */
import { errorMessage } from "@featra/work-format";
import { createAllowedProjects } from "./allowed-projects.ts";
import { parseHostMessage, type ServerMessage } from "./host-messages.ts";
import { nodeRoleFs } from "./role-fs.ts";
import { createServices } from "./services.ts";
import { startServer, type RunningServer } from "./ws-server.ts";

const send = (message: ServerMessage) => process.send?.(message);
const log = (message: string) => send({ type: "log", message });

const allowed = createAllowedProjects();
// The host names the app's data folder, where chats are saved (STORY-44).
const services = createServices({
  allowed,
  log,
  dataDir: process.env.FEATRA_DATA_DIR || undefined,
  roleFs: nodeRoleFs(),
  // The host names the Featra MCP's script, and runs it with the same runtime as this process (STORY-47).
  mcpEntry: process.env.FEATRA_MCP_ENTRY || undefined,
});
const { api, agents } = services;
let server: RunningServer | undefined;

process.on("message", (raw) => {
  const message = parseHostMessage(raw);
  if (!message) {
    log("Ignored a malformed message from the host.");
    return;
  }
  switch (message.type) {
    case "start":
      if (server) return;
      startServer({ token: message.token, api, agents, log }).then(
        (running) => {
          server = running;
          agents.setPort(running.port);
          send({ type: "listening", port: running.port });
        },
        (err: unknown) => send({ type: "failed", error: errorMessage(err) }),
      );
      return;
    case "projects":
      allowed.set(message.dirs);
      send({ type: "projects-ack", seq: message.seq });
      return;
    default:
      message satisfies never;
  }
});

process.on("disconnect", () => {
  void (server?.close() ?? Promise.resolve()).then(() => services.close()).finally(() => process.exit(0));
});
