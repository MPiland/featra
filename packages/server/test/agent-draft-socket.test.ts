/**
 * STORY-49 AC2 end to end on the server: a chat's MCP calls `cards.draft` over the agent socket with its secret, and the
 * chat list the window watches shows the feature's title. Real socket, bridge, chat manager, draft writer and repository;
 * only the Agent SDK is faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENT_PATH, chatName, type ChatSummary } from "@featra/work-format";
import { createAgentBridge } from "../src/agent-bridge.ts";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createDraftWriter } from "../src/draft-writer.ts";
import { createLogWriter } from "../src/log-writer.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { fakeClaude } from "./fake-query.ts";
import { connect, request } from "./ws-client.ts";

let scanner: ReturnType<typeof createScanner>;
let repo: CardRepo;
let manager: ChatManager;
let server: RunningServer;
let secret = "";
let chat = "";

beforeAll(async () => {
  scanner = createScanner(createRepoGit());
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "done"));
  repo.commit(repo.main, "plan");
  manager = createChatManager({
    providers: [createClaudeProvider(fakeClaude().deps)],
    roles: createRoleRegistry(),
    store: { load: async () => ({ version: 1, chats: [] }), save: async () => {} },
  });
  const bridge = createAgentBridge({
    entry: "/app/mcp.cjs",
    exists: async () => true,
    enabled: async () => true,
    chats: manager,
    writer: createLogWriter({ fs: { read: async () => null, write: async () => {} }, now: () => new Date() }),
    drafts: createDraftWriter({ scan: scanner.scan, now: () => new Date("2026-11-10T09:00:00Z") }),
  });
  server = await startServer({
    token: "window-token-0123456789",
    api: async () => null,
    agents: bridge,
    log: () => {},
  });
  bridge.setPort(server.port);
  chat = await manager.start(repo.main, "dev-lead");
  secret = (await bridge.attach({ id: chat, dir: repo.main }))?.env.FEATRA_AGENT_TOKEN ?? "";
});
afterAll(async () => {
  await server.close();
  manager.close();
  await scanner.close();
  await repo.dispose();
});

describe("a draft over the agent socket", () => {
  it("renames the chat that the secret belongs to, in the list the window watches", async () => {
    const heard: ChatSummary[][] = [];
    manager.watchList(repo.main, (chats) => heard.push(chats));
    const socket = await connect(`ws://127.0.0.1:${server.port}${AGENT_PATH}?token=${encodeURIComponent(secret)}`);
    try {
      const answer = await socket.ask(
        request(1, "cards.draft", {
          feature: { title: "Shaping", description: "Talk a feature through." },
          stories: [
            { id: null, title: "Draft it", story: "As a builder, I draft.", criteria: ["It drafts"], tasks: ["Build"] },
          ],
        }),
      );
      expect(answer).toMatchObject({ id: 1, ok: true, result: { created: true } });
    } finally {
      socket.close();
    }
    const row = heard.at(-1)?.find((c) => c.id === chat);
    expect(row && chatName(row)).toBe("Shaping");
    expect(row?.titleBy).toBe("draft");
  });
});
