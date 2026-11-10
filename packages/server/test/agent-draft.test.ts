/**
 * STORY-8: `cards.draft` through the real agent bridge, the real draft writer and a real repository. The chat comes
 * from the secret, the MCP and knowledge settings apply, and a refused draft writes nothing. Only the clock is fixed.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AGENT_PATH, type DraftInput, type KnowledgePermission } from "@featra/work-format";
import { AGENT_MESSAGES, createAgentBridge, type AgentBridge } from "../src/agent-bridge.ts";
import { createDraftWriter } from "../src/draft-writer.ts";
import { createLogWriter } from "../src/log-writer.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { connect, request } from "./ws-client.ts";

const WINDOW = "window-token-0123456789";
const settings: { enabled: boolean; knowledge: KnowledgePermission } = { enabled: true, knowledge: "propose" };
const logs = () => createLogWriter({ fs: { read: async () => null, write: async () => {} }, now: () => new Date() });
let scanner: ReturnType<typeof createScanner>;
let repo: CardRepo;
let bridge: AgentBridge;
let server: RunningServer;

const input = (title = "Shaping"): DraftInput => ({
  feature: { title, description: "Talk a feature through." },
  stories: [
    { id: null, title: "Draft it", story: "As a builder, I draft.", criteria: ["It drafts"], tasks: ["Build"] },
  ],
});
const files = async () => (await readdir(join(repo.main, ".featra", "cards"))).toSorted();

beforeAll(async () => {
  scanner = createScanner(createRepoGit());
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "done"));
  repo.commit(repo.main, "plan");
  bridge = createAgentBridge({
    entry: "/app/mcp.cjs",
    exists: async () => true,
    enabled: async () => settings.enabled,
    knowledge: async () => settings.knowledge,
    chats: {
      info: (id) => (id === "chat-1" ? { dir: repo.main, session: "Dev Lead chat 1" } : null),
      report: () => {},
    },
    writer: logs(),
    drafts: createDraftWriter({ scan: scanner.scan, now: () => new Date("2026-11-10T09:00:00Z") }),
  });
  server = await startServer({ token: WINDOW, api: async () => null, agents: bridge, log: () => {} });
  bridge.setPort(server.port);
});
beforeEach(() => {
  settings.enabled = true;
  settings.knowledge = "propose";
});
afterAll(async () => {
  await server.close();
  await scanner.close();
  await repo.dispose();
});

describe("cards.draft on the bridge", () => {
  it("is refused when the project's MCP is off, and writes nothing", async () => {
    const before = await files();
    settings.enabled = false;
    await expect(bridge.call("chat-1", "cards.draft", input("Off"))).rejects.toThrow(AGENT_MESSAGES.mcpOff);
    expect(await files()).toEqual(before);
  });

  it("is refused when the knowledge setting is read-only, and writes nothing", async () => {
    const before = await files();
    settings.knowledge = "read-only";
    await expect(bridge.call("chat-1", "cards.draft", input("Locked"))).rejects.toThrow(AGENT_MESSAGES.draftReadOnly);
    expect(await files()).toEqual(before);
  });

  it("refuses a malformed draft with why, and writes nothing", async () => {
    const before = await files();
    const bad = {
      feature: { title: "Bad", description: "d" },
      stories: [{ title: "No criteria", story: "As a builder, I x." }],
    };
    await expect(bridge.call("chat-1", "cards.draft", bad)).rejects.toThrow(/^Not drafted\. /);
    await expect(bridge.call("chat-1", "cards.draft", "nonsense")).rejects.toThrow(/^Not drafted\. /);
    expect(await files()).toEqual(before);
  });

  it("is refused for a chat the server doesn't know", async () => {
    await expect(bridge.call("ghost", "cards.draft", input())).rejects.toThrow("No such chat.");
  });

  it("says drafting isn't available when the server has no draft writer", async () => {
    const bare = createAgentBridge({
      entry: null,
      enabled: async () => true,
      chats: { info: () => ({ dir: repo.main, session: "s" }), report: () => {} },
      writer: logs(),
    });
    await expect(bare.call("chat-1", "cards.draft", input())).rejects.toThrow(AGENT_MESSAGES.noDrafts);
  });
});

describe("cards.draft on the agent socket", () => {
  it("drafts for the chat the secret belongs to, whatever the params name, and refuses a malformed draft", async () => {
    const spec = await bridge.attach({ id: "chat-1", dir: repo.main });
    const url = `ws://127.0.0.1:${server.port}${AGENT_PATH}?token=${encodeURIComponent(spec?.env.FEATRA_AGENT_TOKEN ?? "")}`;
    const socket = await connect(url);
    try {
      const ok = await socket.ask(
        request(1, "cards.draft", { ...input("Over the socket"), chat: "chat-2", id: "chat-2" }),
      );
      expect(ok).toMatchObject({ id: 1, ok: true, result: { created: true, feature: "FEAT-2" } });
      const { cards } = (await scanner.scan(repo.main))!.resolution;
      expect(cards.find((c) => c.card.id === "FEAT-2")?.card.extra).toEqual({ "drafted-by": "chat-1" });
      const bad = await socket.ask(request(2, "cards.draft", { feature: { title: "x" } }));
      expect(bad).toMatchObject({ id: 2, ok: false });
    } finally {
      socket.close();
    }
  });
});
