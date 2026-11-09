/**
 * STORY-47 AC1: every chat gets the Featra MCP unless Settings turns it off. A chat through the real manager and
 * Claude adapter, the real agent bridge and log writer; only the SDK's `query` and the disk are fake.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createAgentBridge, MCP_NAME } from "../src/agent-bridge.ts";
import type { ChatManager } from "../src/chat-manager.ts";
import { createLogWriter } from "../src/log-writer.ts";
import { chat, closeChats, DIR } from "./chat-fixture.ts";
import { fakeClaude } from "./fake-query.ts";

afterEach(closeChats);

const DECISION = { kind: "decision", decision: "Use a socket", why: "Scoped secrets.", rejected: [], card: null };

function setup({
  enabled = true,
  port = 4321,
  entry = "/app/dist/mcp.cjs",
}: { enabled?: boolean; port?: number; entry?: string | null } = {}) {
  const disk = new Map<string, string>();
  let manager: ChatManager | undefined;
  let tokens = 0;
  const bridge = createAgentBridge({
    entry,
    execPath: "/app/featra",
    enabled: async () => enabled,
    chats: {
      info: (id) => manager?.info(id) ?? null,
      report: (id, event) => manager?.report(id, event),
    },
    writer: createLogWriter({
      fs: {
        read: async (file) => disk.get(file) ?? null,
        write: async (file, text) => void disk.set(file, text),
      },
      now: () => new Date("2026-11-09T00:00:00Z"),
      newId: () => "e1",
    }),
    newToken: () => `secret-${++tokens}`,
  });
  if (port) bridge.setPort(port);
  return {
    bridge,
    disk,
    chat: async () => {
      const c = await chat("developer", fakeClaude(), { mcp: bridge });
      manager = c.manager;
      c.send("hello");
      return { ...c, started: await c.run() };
    },
  };
}

describe("AC1: a session gets the Featra MCP unless it is off", () => {
  it("starts the Claude session with the stdio server and its tools allowed", async () => {
    const { started, id } = await setup().chat();
    expect(started.options.mcpServers).toEqual({
      [MCP_NAME]: {
        type: "stdio",
        command: "/app/featra",
        args: ["/app/dist/mcp.cjs"],
        env: {
          ELECTRON_RUN_AS_NODE: "1",
          FEATRA_AGENT_URL: "ws://127.0.0.1:4321/v1/agent",
          FEATRA_AGENT_TOKEN: "secret-1",
        },
      },
    });
    expect(started.options.allowedTools).toEqual(["mcp__featra"]);
    expect(id).toBeTruthy();
  });

  it("offers no tools when the setting is off", async () => {
    const { started } = await setup({ enabled: false }).chat();
    expect(started.options.mcpServers).toBeUndefined();
    expect(started.options.allowedTools).toBeUndefined();
  });

  it("offers none without a bundled MCP, or before the server listens", async () => {
    expect((await setup({ entry: null }).chat()).started.options.mcpServers).toBeUndefined();
    expect((await setup({ port: 0 }).chat()).started.options.mcpServers).toBeUndefined();
  });

  it("gives each chat its own secret, which stops working when the chat ends", async () => {
    const { bridge } = setup();
    const a = await bridge.attach({ id: "chat-a", dir: DIR });
    const b = await bridge.attach({ id: "chat-b", dir: DIR });
    expect(a?.env.FEATRA_AGENT_TOKEN).not.toBe(b?.env.FEATRA_AGENT_TOKEN);
    expect(bridge.resolve(a?.env.FEATRA_AGENT_TOKEN ?? "")).toBe("chat-a");
    expect(bridge.resolve("guess")).toBeNull();
    bridge.release("chat-a");
    expect(bridge.resolve(a?.env.FEATRA_AGENT_TOKEN ?? "")).toBeNull();
    expect(bridge.resolve(b?.env.FEATRA_AGENT_TOKEN ?? "")).toBe("chat-b");
  });
});

describe("what a logged entry does in the chat", () => {
  it("shows in the chat as logged, and Undo removes it and shows it undone", async () => {
    const { bridge, disk, chat: start } = setup();
    const c = await start();
    const logged = await bridge.call(c.id, "log.append", DECISION);
    expect(logged).toEqual({ entry: "e1", file: "decisions.md" });
    expect([...disk.values()][0]).toContain("Use a socket");
    expect(c.view().items).toContainEqual(
      expect.objectContaining({
        kind: "log",
        entry: "e1",
        file: "decisions.md",
        summary: "Use a socket",
        undone: false,
      }),
    );
    await bridge.undo(c.id, "e1");
    expect([...disk.values()][0]).not.toContain("Use a socket");
    expect(c.view().items).toContainEqual(expect.objectContaining({ kind: "log", entry: "e1", undone: true }));
  });

  it("names the session in the entry so a reader knows which chat logged it", async () => {
    const { bridge, disk, chat: start } = setup();
    const c = await start();
    await bridge.call(c.id, "log.append", DECISION);
    expect([...disk.values()][0]).toMatch(new RegExp(`Session: Developer chat ${c.id.slice(0, 8)}`));
  });

  it("refuses a bad input, or an unknown chat, writing nothing", async () => {
    const { bridge, disk, chat: start } = setup();
    const c = await start();
    await expect(bridge.call(c.id, "log.append", { kind: "decision", decision: "No why" })).rejects.toThrow('"why"');
    await expect(bridge.call(c.id, "log.append", { kind: "other" })).rejects.toThrow("Unknown kind");
    await expect(bridge.call("no-such-chat", "log.append", DECISION)).rejects.toThrow("No such chat");
    expect(disk.size).toBe(0);
  });
});
