/**
 * STORY-44: chats come back after a restart, through the real session manager, Claude adapter, JSON store and the
 * SDK's real session reader. Faked: the SDK's `query`, the folder Claude's session files live in, and the clock.
 */
import { readFile, writeFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CHAT_MESSAGES, normalizeSavedChats, type ChatEvent, type SavedChats } from "@featra/work-format";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createJsonStore } from "../src/json-store.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { CHATS_FILE } from "../src/services.ts";
import { claudeHome, projectFolder, sessionLines } from "./claude-sessions.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { filesIn, tempFolder } from "./temp-folder.ts";
import { until } from "./until.ts";

const NOW = new Date("2026-11-09T10:00:00.000Z");
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

const store = () => createJsonStore(data.dir, CHATS_FILE, normalizeSavedChats);
const saved = async (): Promise<SavedChats> => JSON.parse(await readFile(store().file, "utf8")) as SavedChats;

/** The app, started (or started again) on the same data folder. */
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

/** Opens the chat and gives its log so far, and every later event. */
async function opened(manager: ChatManager, id: string) {
  await manager.open(id);
  const events: ChatEvent[] = [];
  const { events: log } = manager.watch(id, (e) => events.push(e));
  return { log, events };
}

/** A chat run once: "hello", answered "Hi." in Claude's session `session`, which Claude has saved. */
async function firstRun(session: string) {
  const first = app();
  const id = await first.manager.start(project.dir, "qa");
  first.manager.send(id, "hello");
  await until(() => first.runs.length > 0);
  first.runs[0]!.say(sdk.init("claude-sonnet-5-5", session), sdk.assistant("m1", [sdk.text("Hi.")]), sdk.success());
  await until(() => first.manager.list(project.dir)[0]?.running === false);
  await sessionLines(project.dir, session)
    .prompt("hello")
    .reply("m1", [sdk.text("Hi.")])
    .write();
  await first.manager.flush();
  first.manager.close();
  return id;
}

describe("AC1: the chat is kept in the app's data", () => {
  it("saves its session id, title, project and role, and nothing in the repo", async () => {
    const session = sessionLines(project.dir).session;
    const id = await firstRun(session);
    expect((await saved()).chats).toEqual([
      {
        dir: project.dir,
        session,
        summary: {
          id,
          provider: "claude",
          role: expect.objectContaining({ id: "qa", name: "QA" }),
          title: "hello",
          startedAt: NOW.toISOString(),
          running: false,
          // The turn is done: the chat waits on the user's reply.
          waiting: "reply",
        },
      },
    ]);
    expect(await filesIn(project.dir)).toEqual([]);
  });
});

describe("AC2: after a restart the list shows the same chats, and opening one shows its transcript", () => {
  it("lists them, and reads the transcript from Claude's session file without running the agent", async () => {
    const session = sessionLines(project.dir).session;
    const id = await firstRun(session);
    const before = (await saved()).chats.map((c) => c.summary);

    const again = app();
    await again.manager.flush();
    expect(again.manager.list(project.dir)).toEqual(before);
    const { log } = await opened(again.manager, id);
    expect(log).toEqual([
      { type: "user", text: "hello" },
      { type: "text", block: "m1:0", delta: "Hi." },
      { type: "turn-end", outcome: "done" },
    ]);
    expect(again.runs).toEqual([]);
  });

  it("pushes the restored chats to a list watcher that came before they were read", async () => {
    const id = await firstRun(sessionLines(project.dir).session);
    const again = app();
    const pushed: string[][] = [];
    again.manager.watchList(project.dir, (chats) => pushed.push(chats.map((c) => c.id)));
    await again.manager.flush();
    expect(pushed.at(-1)).toEqual([id]);
  });
});

describe("AC3: a message to a restored chat resumes its Claude session", () => {
  it("starts the agent on the same session, and the reply joins the transcript", async () => {
    const session = sessionLines(project.dir).session;
    const id = await firstRun(session);
    const again = app();
    const { events } = await opened(again.manager, id);

    again.manager.send(id, "and again?");
    await until(() => (again.runs[0]?.heard.length ?? 0) > 0);
    const run = again.runs[0]!;
    expect(run.options.resume).toBe(session);
    expect(run.heard).toEqual(["and again?"]);
    run.say(sdk.init("claude-sonnet-5-5", session), sdk.assistant("m2", [sdk.text("Still here.")]), sdk.success());
    await until(() => events.some((e) => e.type === "turn-end"));
    expect(events).toEqual([
      { type: "user", text: "and again?" },
      { type: "started", model: "claude-sonnet-5-5" },
      { type: "text", block: "m2:0", delta: "Still here." },
      { type: "turn-end", outcome: "done" },
    ]);
    await again.manager.flush();
    expect((await saved()).chats.map((c) => c.session)).toEqual([session]);
  });
});

describe("AC4: a chat whose session file is gone", () => {
  it("says so, and refuses a message", async () => {
    const id = await firstRun(sessionLines(project.dir).session);
    const raw = await saved();
    raw.chats[0]!.session = sessionLines(project.dir).session;
    await writeFile(store().file, JSON.stringify(raw), "utf8");

    const again = app();
    const { log } = await opened(again.manager, id);
    expect(log).toEqual([{ type: "problem", problem: { type: "gone" } }]);
    expect(() => again.manager.send(id, "hello?")).toThrow(CHAT_MESSAGES.gone);
    expect(again.runs).toEqual([]);
    // It stays listed: the user sees the line, and starts a new chat from it.
    expect(again.manager.list(project.dir).map((c) => c.id)).toEqual([id]);
  });

  it("is gone too when its project folder is gone", async () => {
    const id = await firstRun(sessionLines(project.dir).session);
    const raw = await saved();
    raw.chats[0]!.dir = `${project.dir}-gone`;
    await writeFile(store().file, JSON.stringify(raw), "utf8");
    const again = app();
    const { log } = await opened(again.manager, id);
    expect(log).toEqual([{ type: "problem", problem: { type: "gone" } }]);
  });
});

describe("saved chats: the edges", () => {
  it("a chat that never ran its agent comes back and starts a new session", async () => {
    const first = app();
    const id = await first.manager.start(project.dir, "qa");
    await first.manager.flush();
    first.manager.close();
    expect((await saved()).chats[0]?.session).toBeNull();

    const again = app();
    const { log } = await opened(again.manager, id);
    expect(log).toEqual([]);
    again.manager.send(id, "hello");
    await until(() => again.runs.length > 0);
    expect(again.runs[0]!.options.resume).toBeUndefined();
  });

  it("a closed project's chats leave the list, stay saved, and come back when it opens again", async () => {
    const id = await firstRun(sessionLines(project.dir).session);
    const again = app();
    await again.manager.flush();
    again.manager.closeProjects(() => false);
    expect(again.manager.list(project.dir)).toEqual([]);
    await expect(again.manager.open(id)).rejects.toThrow(CHAT_MESSAGES.noChat);
    await again.manager.flush();
    expect((await saved()).chats.map((c) => c.summary.id)).toContain(id);

    again.manager.closeProjects(() => true);
    expect(again.manager.list(project.dir).map((c) => c.id)).toContain(id);
    const { log } = await opened(again.manager, id);
    expect(log[0]).toEqual({ type: "user", text: "hello" });
  });

  it("a chats file that isn't JSON is read as no chats, and is written over by the next save", async () => {
    await writeFile(store().file, "{ torn", "utf8");
    const again = app();
    await again.manager.flush();
    expect(again.manager.list(project.dir)).toEqual([]);
    const id = await again.manager.start(project.dir, "qa");
    await again.manager.flush();
    expect((await saved()).chats.map((c) => c.summary.id)).toEqual([id]);
  });
});
