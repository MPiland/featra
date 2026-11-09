/**
 * STORY-45: an approval nobody answered when the app quit, and Allow for this chat when the chat ends. Through the real
 * session manager, Claude adapter, JSON store and the SDK's real session reader; faked: `query`, the folder Claude's
 * session files live in, and the clock.
 */
import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CHAT_MESSAGES, foldChat, type ChatEvent, type SavedChats } from "@featra/work-format";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { fileChatStore } from "../src/chat-store.ts";
import { claudeHome, projectFolder, sessionLines } from "./claude-sessions.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { tempFolder } from "./temp-folder.ts";
import { until } from "./until.ts";

const NOW = new Date("2026-11-09T10:00:00.000Z");
const BASH = { command: "npm test" };
let home: Awaited<ReturnType<typeof claudeHome>>;
let project: Awaited<ReturnType<typeof projectFolder>>;
let data: Awaited<ReturnType<typeof tempFolder>>;
const managers: ChatManager[] = [];

beforeAll(async () => {
  home = await claudeHome();
  project = await projectFolder();
});

afterAll(async () => {
  await project.dispose();
  await home.dispose();
});

beforeEach(async () => {
  data = await tempFolder();
});

afterEach(async () => {
  for (const m of managers.splice(0)) m.close();
  await data.dispose();
});

const store = () => fileChatStore(data.dir);
const saved = async (): Promise<SavedChats> => JSON.parse(await readFile(store().file, "utf8")) as SavedChats;

function app(claude = fakeClaude()) {
  const manager = createChatManager({
    providers: [createClaudeProvider(claude.deps)],
    roles: createRoleRegistry(),
    store: store(),
    now: () => NOW,
  });
  managers.push(manager);
  return { ...claude, manager };
}

/**
 * A chat whose agent called Bash `npm test` in Claude's session `session` and is waiting on the user's answer. Claude
 * has saved the call, and no result for it.
 */
async function waitingOnBash(session: string) {
  const first = app();
  const id = await first.manager.start(project.dir, "developer");
  const events: ChatEvent[] = [];
  first.manager.watch(id, (e) => events.push(e));
  first.manager.send(id, "test it");
  await until(() => first.runs.length > 0);
  const run = first.runs[0]!;
  run.say(sdk.init("claude-sonnet-5-5", session), sdk.assistant("m1", [sdk.toolUse("t1", "Bash", BASH)]));
  await until(() => events.some((e) => e.type === "tool"));
  const asked = run.ask("Bash", BASH, "t1");
  await until(() => first.manager.list(project.dir)[0]?.waiting === "approval");
  await sessionLines(project.dir, session)
    .prompt("test it")
    .reply("m1", [sdk.toolUse("t1", "Bash", BASH)])
    .write();
  return { first, id, events, asked };
}

describe("an approval left unanswered when the app quit", () => {
  it("comes back cancelled, not denied, with the chat waiting on a reply rather than an approval", async () => {
    const { first, id } = await waitingOnBash(sessionLines(project.dir).session);
    await first.manager.flush();
    // The app quits here without closing. A saved row never waits on an approval: no agent is left to answer.
    expect((await saved()).chats.find((c) => c.summary.id === id)?.summary).toMatchObject({
      waiting: "reply",
      running: false,
    });

    const again = app();
    await again.manager.flush();
    expect(again.manager.list(project.dir).find((c) => c.id === id)).toMatchObject({
      waiting: "reply",
      running: false,
    });
    await again.manager.open(id);
    const { events: log } = again.manager.watch(id, () => {});
    const tool = foldChat(log).items.find((i) => i.kind === "tool");
    expect(tool).toMatchObject({ name: "Bash", input: BASH, cancelled: true, denied: false, approval: null });
    expect(() => again.manager.approve(id, "t1", { choice: "allow" })).toThrow(CHAT_MESSAGES.noRequest);
  });
});

describe("Allow for this chat when the chat ends", () => {
  it("is forgotten: the chat opened again asks about the same command", async () => {
    const { first, id, events, asked } = await waitingOnBash(sessionLines(project.dir).session);
    first.manager.approve(id, "t1", { choice: "allow-chat" });
    expect(await asked).toMatchObject({ behavior: "allow" });
    first.runs[0]!.say(sdk.toolResult("t1", "ok"), sdk.success());
    await until(() => first.manager.list(project.dir)[0]?.running === false);
    expect(events).toContainEqual({ type: "tool-allowed", id: "t1", name: "Bash", input: BASH, scope: "chat" });

    first.manager.closeProjects(() => false);
    first.manager.closeProjects(() => true);
    await first.manager.open(id);
    const later: ChatEvent[] = [];
    first.manager.watch(id, (e) => later.push(e));
    first.manager.send(id, "again");
    await until(() => first.runs.length > 1);
    const next = first.runs[1]!;
    next.say(sdk.assistant("m2", [sdk.toolUse("t2", "Bash", BASH)]));
    await until(() => later.some((e) => e.type === "tool"));
    void next.ask("Bash", BASH, "t2");
    await until(() => later.some((e) => e.type === "approval"));
  });
});
