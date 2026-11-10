/**
 * STORY-22 AC1 across a reopen and a restart: a chat keeps the role, model, effort and mode picked in its composer, and
 * its meter shows the window at once. Real session manager, Claude adapter, JSON store and the SDK's session reader.
 * Faked: the SDK's `query`, the folder Claude's session files live in, and the clock.
 */
import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ChatEvent, SavedChats } from "@featra/work-format";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { fileChatStore } from "../src/chat-store.ts";
import { claudeHome, projectFolder, sessionLines } from "./claude-sessions.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { tempFolder } from "./temp-folder.ts";
import { until } from "./until.ts";

const NOW = new Date("2026-11-09T10:00:00.000Z");
const usage = {
  input_tokens: 1000,
  cache_read_input_tokens: 2000,
  cache_creation_input_tokens: 300,
  output_tokens: 200,
};
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

function app() {
  const claude = fakeClaude();
  const manager = createChatManager({
    providers: [createClaudeProvider(claude.deps)],
    roles: createRoleRegistry(),
    store: store(),
    now: () => NOW,
  });
  managers.push(manager);
  return { ...claude, manager };
}

/** A chat from QA run once (window 200000, 3500 tokens), then closed: its Claude session `session` is on disk. */
async function firstRun(session: string, change?: (a: ReturnType<typeof app>, id: string) => Promise<void>) {
  const first = app();
  const id = await first.manager.start(project.dir, "qa");
  first.manager.send(id, "hello");
  await until(() => first.runs.length > 0);
  first.runs[0]!.say(
    sdk.init("claude-sonnet-5-5", session),
    sdk.assistant("m1", [sdk.text("Hi.")], {}, usage),
    sdk.success("Hi.", { modelUsage: { "claude-sonnet-5-5": { contextWindow: 200_000 } } }),
  );
  await until(() => first.manager.list(project.dir)[0]?.running === false);
  await sessionLines(project.dir, session)
    .prompt("hello")
    .reply("m1", [sdk.text("Hi.")], usage)
    .write();
  await change?.(first, id);
  await first.manager.flush();
  first.manager.close();
  return id;
}

describe("a reopened chat keeps its composer choices and shows its window at once", () => {
  it("keeps model, effort and mode over a restart, lists the effective model, and resumes with them", async () => {
    const session = sessionLines(project.dir).session;
    const id = await firstRun(session, async (a, chat) => {
      await a.manager.configure(chat, { effort: "low", mode: "plan" });
    });
    const picked = await saved();
    expect(picked.chats[0]!.composer).toMatchObject({ settings: { role: "qa", effort: "low", mode: "plan" } });

    const again = app();
    await again.manager.flush();
    expect(again.manager.list(project.dir)[0]!.role).toMatchObject({ id: "qa", effort: "low" });
    await again.manager.open(id);
    const state = await again.manager.controls(id);
    expect(state.settings).toMatchObject({ role: "qa", effort: "low", mode: "plan" });

    again.manager.send(id, "more");
    await until(() => again.runs.length === 1);
    expect(again.runs[0]!.options).toMatchObject({ effort: "low", permissionMode: "plan", resume: session });
  });

  it("shows the model the chat runs with, not its role's, in the list after a restart", async () => {
    const session = sessionLines(project.dir).session;
    const id = await firstRun(session, async (a, chat) => {
      await a.manager.configure(chat, { model: "opus" });
    });
    const again = app();
    await again.manager.flush();
    expect(again.manager.list(project.dir)[0]!.role.model).toBe("opus");
    await again.manager.open(id);
    expect((await again.manager.controls(id)).settings.model).toBe("opus");
  });

  it("gives the meter the window the last turn reported, with no new turn", async () => {
    const session = sessionLines(project.dir).session;
    const id = await firstRun(session);
    expect((await saved()).chats[0]!.composer).toMatchObject({ window: 200_000 });
    const again = app();
    await again.manager.flush();
    await again.manager.open(id);
    const events: ChatEvent[] = [];
    const { events: log } = again.manager.watch(id, (e) => events.push(e));
    expect(log.filter((e) => e.type === "usage")).toEqual([{ type: "usage", used: 3500, window: 200_000 }]);
  });

  it("forgets the window when the model changes: it was the old model's, and the next turn reports the new one's", async () => {
    const session = sessionLines(project.dir).session;
    await firstRun(session, async (a, chat) => {
      await a.manager.configure(chat, { model: "opus" });
    });
    expect((await saved()).chats[0]!.composer).toMatchObject({ settings: { model: "opus" }, window: null });
  });

  it("never lets a saved mode reach full access when the chat didn't start in it", async () => {
    const session = sessionLines(project.dir).session;
    const id = await firstRun(session);
    const file = await saved();
    const chat = file.chats[0]!;
    const forged = {
      ...file,
      chats: [
        {
          ...chat,
          composer: {
            settings: { ...chat.composer!.settings, mode: "bypassPermissions" },
            window: null,
            fullAccess: false,
          },
        },
      ],
    };
    const { writeFile } = await import("node:fs/promises");
    await writeFile(store().file, JSON.stringify(forged), "utf8");
    const again = app();
    await again.manager.flush();
    await again.manager.open(id);
    const { settings, controls } = await again.manager.controls(id);
    expect(settings.mode).toBe("default");
    expect(controls.modes.map((m) => m.value)).not.toContain("bypassPermissions");
  });
});
