/**
 * STORY-9 AC7 (the MCP side): `spawn_session` through the real Featra MCP process over stdio, the real agent bridge and
 * WebSocket server. The story runner behind the bridge is the platform here (it makes worktrees and sessions; the server's
 * own tests run it for real), so the test sees what the tool sends and how the answers read to the agent.
 */
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createAgentBridge,
  createAllowedProjects,
  createLogWriter,
  ApiError,
  createServices,
  startServer,
  type AgentBridge,
  type RunningServer,
  type StorySpawn,
} from "@featra/server";
import { TOOLS } from "../src/index.ts";

const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const CHAT = "chat-1";
const DIR = "/work/featra";

const calls: { dir: string; input: unknown; chat: string }[] = [];
let queue = false;
const spawns = {
  async spawn(dir, input, chat) {
    calls.push({ dir, input, chat });
    if (input.story === "STORY-404") throw new ApiError("That card is gone.");
    return { chat: "story-chat", queued: queue };
  },
  start: async () => ({ chat: "x", queued: false }),
} as StorySpawn;

let server: RunningServer;
let bridge: AgentBridge;
let services: ReturnType<typeof createServices>;
const clients: Client[] = [];

beforeAll(async () => {
  bridge = createAgentBridge({
    entry: MAIN,
    enabled: () => Promise.resolve(true),
    chats: {
      info: (id) => (id === CHAT ? { dir: DIR, session: "Lead 1a2b3c4d" } : null),
      report: () => {},
      retitle: () => {},
    },
    writer: createLogWriter({
      fs: { read: async () => null, write: async () => {} },
      now: () => new Date("2026-11-10T09:00:00Z"),
    }),
    spawns,
  });
  services = createServices({ allowed: createAllowedProjects(), log: () => {} });
  server = await startServer({ token: "window-token-0123456789", api: services.api, agents: bridge, log: () => {} });
  bridge.setPort(server.port);
});
afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
  await server.close();
  await services.close();
});

async function agent(): Promise<Client> {
  const spec = await bridge.attach({ id: CHAT, dir: DIR });
  if (!spec) throw new Error("The bridge offered no MCP.");
  const client = new Client({ name: "agent", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ ...spec, stderr: "pipe" }));
  clients.push(client);
  return client;
}
const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]?.text ?? "";
const isError = (r: unknown) => (r as { isError?: boolean }).isError === true;
const spawn = (client: Client, args: Record<string, unknown>) =>
  client.callTool({ name: "spawn_session", arguments: args });

describe("spawn_session through the Featra MCP", () => {
  it("is listed with its own description and requires only the story", async () => {
    const { tools } = await (await agent()).listTools();
    const tool = tools.find((t) => t.name === "spawn_session");
    expect(tool?.description).toBe(TOOLS.find((t) => t.name === "spawn_session")?.description);
    expect(tool?.inputSchema.required).toEqual(["story"]);
  });

  it("sends the story, role, model, effort and brief for the calling chat, and says it started", async () => {
    const result = await spawn(await agent(), {
      story: "story-9",
      model: "opus",
      effort: "high",
      brief: "Mind the paths.",
    });
    expect(isError(result)).toBe(false);
    expect(text(result)).toBe("Started STORY-9.");
    expect(calls.at(-1)).toEqual({
      dir: DIR,
      chat: CHAT,
      input: { story: "STORY-9", role: "developer", model: "opus", effort: "high", brief: "Mind the paths." },
    });
  });

  it("says when the story was queued", async () => {
    queue = true;
    const result = await spawn(await agent(), { story: "STORY-9" });
    queue = false;
    expect(text(result)).toBe("Queued STORY-9. It starts when a story agent ends.");
  });

  it("tells the agent why in one sentence when it is refused, and never calls the runner for a bad id", async () => {
    const client = await agent();
    const before = calls.length;
    const gone = await spawn(client, { story: "STORY-404" });
    expect(isError(gone)).toBe(true);
    expect(text(gone)).toBe("Not started. That card is gone.");
    const bad = await spawn(client, { story: "soon" });
    expect(isError(bad)).toBe(true);
    expect(text(bad)).toBe("Not started. Give the story's id, such as STORY-9, as `story`.");
    expect(calls).toHaveLength(before + 1);
  });
});
