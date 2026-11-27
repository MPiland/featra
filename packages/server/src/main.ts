/**
 * The server process (ADR 0015). The desktop host forks it on Electron's own Node (`ELECTRON_RUN_AS_NODE=1`) with an
 * IPC channel, sends `start` with the token, and keeps the open-project list current. The server tells it how many
 * agents wait on the user, for the taskbar and Dock badge (STORY-67), and asks it to capture dev-server pages (STORY-25).
 * When the host goes, so does the server.
 */
import { errorMessage } from "@featra/work-format";
import { createAllowedProjects } from "./allowed-projects.ts";
import { createHostCapture } from "./host-capture.ts";
import { whenHostGone } from "./host-gone.ts";
import { parseHostMessage, type ServerMessage } from "./host-messages.ts";
import { watchWaitingTotal } from "./project-needs.ts";
import { nodeRoleFs } from "./role-fs.ts";
import { createServices } from "./services.ts";
import { startServer, type RunningServer } from "./ws-server.ts";

const send = (message: ServerMessage) => process.send?.(message);
const log = (message: string) => send({ type: "log", message });

const allowed = createAllowedProjects();
// The host's Chromium captures the pages a story moving to review lists (STORY-25, ADR 0044).
const capture = createHostCapture(process.send ? send : null);
// The host names the app's data folder, where chats are saved (STORY-44).
const services = createServices({
  allowed,
  log,
  dataDir: process.env.FEATRA_DATA_DIR || undefined,
  roleFs: nodeRoleFs(),
  // The host names the Featra MCP's script, and runs it with the same runtime as this process (STORY-47).
  mcpEntry: process.env.FEATRA_MCP_ENTRY || undefined,
  capturePage: capture.capture,
});
const { api, agents } = services;
let server: RunningServer | undefined;
// The badge counts the same waiting agents as the switcher, across every open project (STORY-67).
watchWaitingTotal(services.needs, (count) => send({ type: "waiting", count }));

process.on("message", (raw) => {
  const message = parseHostMessage(raw);
  if (!message) {
    log("Ignored a malformed message from the host.");
    return;
  }
  switch (message.type) {
    case "start":
      if (server) return;
      startServer({ token: message.token, api, agents, log, pageConnected: () => log("Page connected") }).then(
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
    case "settings":
      services.settingsChanged();
      return;
    case "captured":
      capture.settle(message);
      return;
    default:
      message satisfies never;
  }
});

process.on("disconnect", () => {
  void whenHostGone({
    capture,
    devServers: services.devServers,
    close: () => (server?.close() ?? Promise.resolve()).then(() => services.close()),
    exit: () => process.exit(0),
  });
});
