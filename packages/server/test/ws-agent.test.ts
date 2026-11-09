/** STORY-47: the agent socket is narrow: one chat's secret, one method, and the window's methods stay out of reach. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENT_PATH } from "@featra/work-format";
import { createAgentBridge } from "../src/agent-bridge.ts";
import { createLogWriter } from "../src/log-writer.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { connect, request } from "./ws-client.ts";

const WINDOW = "window-token-0123456789";
const DECISION = { kind: "decision", decision: "Use a socket", why: "Scoped secrets.", rejected: [], card: null };
const disk = new Map<string, string>();
const windowCalls: string[] = [];
const reported: { chat: string; type: string }[] = [];
let server: RunningServer;
let secret = "";

beforeAll(async () => {
  const bridge = createAgentBridge({
    entry: "/app/mcp.cjs",
    enabled: async () => true,
    chats: {
      info: (id) => (id === "chat-1" ? { dir: "/work/demo", session: "Developer chat 1" } : null),
      report: (chat, event) => void reported.push({ chat, type: event.type }),
    },
    writer: createLogWriter({
      fs: { read: async (f) => disk.get(f) ?? null, write: async (f, t) => void disk.set(f, t) },
      now: () => new Date("2026-11-09T00:00:00Z"),
    }),
  });
  server = await startServer({
    token: WINDOW,
    api: async (method) => {
      windowCalls.push(method);
      return null;
    },
    agents: bridge,
    log: () => {},
  });
  bridge.setPort(server.port);
  secret = (await bridge.attach({ id: "chat-1", dir: "/work/demo" }))?.env.FEATRA_AGENT_TOKEN ?? "";
});
afterAll(() => server.close());

const agentUrl = (token: string) => `ws://127.0.0.1:${server.port}${AGENT_PATH}?token=${encodeURIComponent(token)}`;

describe("the agent socket", () => {
  it("takes a chat's secret on /v1/agent, and refuses the window's token, a wrong one, or none", async () => {
    (await connect(agentUrl(secret))).close();
    await expect(connect(agentUrl(WINDOW))).rejects.toThrow("Can't connect");
    await expect(connect(agentUrl("wrong"))).rejects.toThrow("Can't connect");
    await expect(connect(`ws://127.0.0.1:${server.port}${AGENT_PATH}`)).rejects.toThrow("Can't connect");
  });

  it("refuses a chat's secret on the window's path", async () => {
    await expect(connect(`${server.url}?token=${encodeURIComponent(secret)}`)).rejects.toThrow("Can't connect");
  });

  it("appends an entry for the chat the secret belongs to, whatever the params say", async () => {
    const socket = await connect(agentUrl(secret));
    try {
      const answer = await socket.ask(request(1, "log.append", { ...DECISION, chat: "someone-else", id: "chat-2" }));
      expect(answer).toEqual({ id: 1, ok: true, result: { entry: expect.any(String), file: "decisions.md" } });
      expect(reported).toContainEqual({ chat: "chat-1", type: "logged" });
      expect(reported.every((r) => r.chat === "chat-1")).toBe(true);
    } finally {
      socket.close();
    }
  });

  it("answers a bad input with why, and never reaches the window's methods", async () => {
    const socket = await connect(agentUrl(secret));
    try {
      expect(await socket.ask(request(2, "log.append", { kind: "decision" }))).toMatchObject({ id: 2, ok: false });
      for (const method of ["chat.approve", "chat.send", "chat.undoLog", "project.init"]) {
        expect(await socket.ask(request(3, method, { id: "chat-1", tool: "t", choice: "allow" }))).toEqual({
          id: 3,
          ok: false,
          error: "Unknown method.",
        });
      }
      expect(windowCalls).toEqual([]);
    } finally {
      socket.close();
    }
  });
});
