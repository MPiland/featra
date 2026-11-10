/**
 * STORY-49 AC2: a draft renames the chat that drafted it, through the real chat manager, agent bridge, draft writer and
 * a real repository. Only the Agent SDK, the clock and the disk's chats file are faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chatName, normalizeSavedChats, type ChatSummary, type DraftInput, type SavedChats } from "@featra/work-format";
import { createAgentBridge } from "../src/agent-bridge.ts";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createDraftWriter } from "../src/draft-writer.ts";
import { createLogWriter } from "../src/log-writer.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { fakeClaude } from "./fake-query.ts";

let scanner: ReturnType<typeof createScanner>;
let repo: CardRepo;
let manager: ChatManager;
let bridge: ReturnType<typeof createAgentBridge>;
const saved: SavedChats[] = [];

const input = (title: string): DraftInput => ({
  feature: { title, description: "Talk a feature through." },
  stories: [
    { id: null, title: "Draft it", story: "As a builder, I draft.", criteria: ["It drafts"], tasks: ["Build"] },
  ],
});
const row = (id: string): ChatSummary => manager.list(repo.main).find((c) => c.id === id) as ChatSummary;

beforeAll(async () => {
  scanner = createScanner(createRepoGit());
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "done"));
  repo.commit(repo.main, "plan");
  manager = createChatManager({
    providers: [createClaudeProvider(fakeClaude().deps)],
    roles: createRoleRegistry(),
    store: { load: async () => ({ version: 1, chats: [] }), save: async (chats) => void saved.push(chats) },
  });
  bridge = createAgentBridge({
    entry: null,
    enabled: async () => true,
    chats: manager,
    writer: createLogWriter({ fs: { read: async () => null, write: async () => {} }, now: () => new Date() }),
    drafts: createDraftWriter({ scan: scanner.scan, now: () => new Date("2026-11-10T09:00:00Z") }),
  });
});
afterAll(async () => {
  manager.close();
  await scanner.close();
  await repo.dispose();
});

describe("a draft renames its chat", () => {
  it("to the feature's title, tells the list's watchers, and saves it", async () => {
    const id = await manager.start(repo.main, "dev-lead");
    expect(chatName(row(id))).toBe("Dev Lead");
    const heard: ChatSummary[][] = [];
    manager.watchList(repo.main, (chats) => heard.push(chats));
    await bridge.call(id, "cards.draft", input("Shaping"));
    expect(chatName(row(id))).toBe("Shaping");
    expect(heard.at(-1)?.find((c) => c.id === id)?.title).toBe("Shaping");
    await manager.flush();
    const kept = saved.at(-1)?.chats.find((c) => c.summary.id === id)?.summary;
    expect(kept?.title).toBe("Shaping");
    expect(kept?.titleBy).toBe("draft");
    // Through the file and back: who named the chat survives a restart.
    const loaded = normalizeSavedChats(JSON.parse(JSON.stringify(saved.at(-1)))).chats.find((c) => c.summary.id === id);
    expect(loaded?.summary.titleBy).toBe("draft");
  });

  it("follows the feature's title when the draft is revised in place", async () => {
    const id = await manager.start(repo.main, "dev-lead");
    await bridge.call(id, "cards.draft", input("First name"));
    await bridge.call(id, "cards.draft", input("Second name"));
    expect(chatName(row(id))).toBe("Second name");
  });

  it("leaves a name the user set alone, and the draft is still written", async () => {
    const id = await manager.start(repo.main, "dev-lead");
    manager.retitle(id, "My own name", "user");
    const result = await bridge.call(id, "cards.draft", input("Not mine"));
    expect(result).toMatchObject({ created: true });
    expect(chatName(row(id))).toBe("My own name");
  });

  it("does not rename when the draft is refused", async () => {
    const id = await manager.start(repo.main, "dev-lead");
    await expect(
      bridge.call(id, "cards.draft", { feature: { title: "Bad", description: "d" }, stories: [] }),
    ).rejects.toThrow(/at least one story/);
    expect(chatName(row(id))).toBe("Dev Lead");
  });
});
