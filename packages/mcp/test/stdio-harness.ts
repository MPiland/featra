/**
 * A real Featra server (its WebSocket, agent bridge and log writer) with a memory disk and a fixed clock, and the real
 * MCP process started over stdio the way an agent's SDK starts it. Only the platform is faked: the disk, the clock and
 * the chat list the server asks about.
 */
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ChatEvent } from "@featra/work-format";
import {
  createAgentBridge,
  createAllowedProjects,
  createLogWriter,
  createServices,
  startServer,
  type LogFs,
  type RunningServer,
} from "@featra/server";

export const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));

export const CHAT = "chat-1";
export const DIR = "/work/featra";
export const WINDOW_TOKEN = "window-token-0123456789";

export function memoryDisk(files: Map<string, string> = new Map()): LogFs & { files: Map<string, string> } {
  return {
    files,
    read: (file) => Promise.resolve(files.get(file) ?? null),
    write: (file, text) => {
      files.set(file, text);
      return Promise.resolve();
    },
  };
}

export interface Harness {
  server: RunningServer;
  disk: ReturnType<typeof memoryDisk>;
  events: ChatEvent[];
  bridge: ReturnType<typeof createAgentBridge>;
  /** The environment the MCP process is given: the server's address and the chat's secret. */
  env: () => Promise<Record<string, string>>;
  /** A client that started the MCP process over stdio. */
  connect: (env?: Record<string, string>) => Promise<Client>;
  close: () => Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const disk = memoryDisk();
  const events: ChatEvent[] = [];
  let ids = 0;
  const bridge = createAgentBridge({
    entry: MAIN,
    enabled: () => Promise.resolve(true),
    chats: {
      info: (id) => (id === CHAT ? { dir: DIR, session: "Developer chat 1a2b3c4d" } : null),
      report: (_id, event) => void events.push(event),
    },
    writer: createLogWriter({
      fs: disk,
      now: () => new Date("2026-11-09T12:00:00Z"),
      newId: () => `e${++ids}`,
      platform: "linux",
    }),
  });
  const services = createServices({ allowed: createAllowedProjects(), log: () => {} });
  const server = await startServer({ token: WINDOW_TOKEN, api: services.api, agents: bridge, log: () => {} });
  bridge.setPort(server.port);
  const clients: Client[] = [];

  const env = async () => {
    const spec = await bridge.attach({ id: CHAT, dir: DIR });
    if (!spec) throw new Error("The bridge offered no MCP.");
    return spec.env;
  };
  return {
    server,
    disk,
    events,
    bridge,
    env,
    async connect(override) {
      const client = new Client({ name: "agent", version: "0.0.0" });
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [MAIN],
        env: override ?? (await env()),
        stderr: "pipe",
      });
      await client.connect(transport);
      clients.push(client);
      return client;
    },
    async close() {
      await Promise.all(clients.map((c) => c.close()));
      await server.close();
      await services.close();
    },
  };
}
