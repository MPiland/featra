/**
 * STORY-50 through the real chat manager and Claude adapter (only the Agent SDK is faked): the reason arrives in the
 * drafting chat as an ordinary user message, a chat that is mid-turn refuses it as a normal send does (and nothing is
 * recorded), and a chat that is gone is refused.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHAT_MESSAGES, foldChat, parseCard, type Card, type ChatEvent } from "@featra/work-format";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createDraftActions, SEND_BACK_MESSAGES } from "../src/draft-actions.ts";
import { createDraftWriter } from "../src/draft-writer.ts";
import { createCardLane } from "../src/card-lane.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { fakeClaude } from "./fake-query.ts";
import { until } from "./until.ts";

let scanner: ReturnType<typeof createScanner>;
let repo: CardRepo;
let manager: ChatManager;
let claude: ReturnType<typeof fakeClaude>;
let chat = "";
let events: ChatEvent[];
let feature = "";
let sendBack: (reason: string) => Promise<null>;

beforeEach(async () => {
  scanner = createScanner(createRepoGit());
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "done"));
  repo.commit(repo.main, "plan");
  claude = fakeClaude();
  manager = createChatManager({
    providers: [createClaudeProvider(claude.deps)],
    roles: createRoleRegistry(),
    store: { load: async () => ({ version: 1, chats: [] }), save: async () => {} },
  });
  chat = await manager.start(repo.main, "dev-lead");
  events = [];
  manager.watch(chat, (e) => events.push(e));
  const lane = createCardLane();
  const writer = createDraftWriter({ scan: scanner.scan, now: () => new Date("2026-11-10T09:00:00Z"), lane });
  const actions = createDraftActions({
    scan: scanner.scan,
    now: () => new Date("2026-11-10T09:30:00Z"),
    lane,
    chats: manager,
  });
  feature = (
    await writer.draft(repo.main, chat, {
      feature: { title: "Shaping", description: "Talk it through." },
      stories: [{ id: null, title: "One", story: "As a builder, I draft.", criteria: ["It drafts"], tasks: ["Build"] }],
    })
  ).feature;
  sendBack = (reason) => actions.sendBack(repo.main, feature, reason);
});
afterEach(async () => {
  manager.close();
  await scanner.close();
  await repo.dispose();
});

const history = async (): Promise<Card["history"]> => {
  const dir = join(repo.main, ".featra", "cards");
  const name = (await readdir(dir)).find((f) => f.startsWith(`${feature}-`)) ?? "";
  return parseCard(await readFile(join(dir, name), "utf8")).history;
};
const userTexts = () => foldChat(events).items.flatMap((e) => (e.kind === "user" ? [e.text] : []));

describe("send back through a real chat", () => {
  it("shows the prefixed reason in the chat as a user message, and the agent reads the same text", async () => {
    await sendBack("Split the second story.");
    const expected = `Sent back ${feature}: Split the second story.`;
    expect(userTexts()).toEqual([expected]);
    await until(() => (claude.runs[0]?.heard.length ?? 0) > 0);
    expect(claude.runs[0]?.heard).toEqual([expected]);
    expect((await history()).at(-1)).toMatchObject({ field: "sent-back", to: "Split the second story.", by: "user" });
  });

  it("is refused as a normal send is while the chat is mid-turn: nothing is recorded", async () => {
    await sendBack("First.");
    const before = await history();
    await expect(sendBack("Second.")).rejects.toThrow(CHAT_MESSAGES.busy);
    expect(await history()).toEqual(before);
    expect(userTexts()).toHaveLength(1);
  });

  it("is refused when the chat's project has been closed", async () => {
    manager.closeProjects(() => false);
    await expect(sendBack("Too big.")).rejects.toThrow(SEND_BACK_MESSAGES.noChat);
  });
});
