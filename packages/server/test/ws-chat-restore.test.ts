/**
 * STORY-44: a chat comes back when the server starts again on the same app data, over the real socket and services.
 * Faked: the SDK's `query`, the PATH lookup, and the folder Claude's session files live in.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChatEvent, ChatList } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { fileChatStore } from "../src/chat-store.ts";
import { createServices } from "../src/services.ts";
import { startServer } from "../src/ws-server.ts";
import { claudeHome, projectFolder, sessionLines } from "./claude-sessions.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { tempFolder } from "./temp-folder.ts";
import { until } from "./until.ts";
import { openFrames } from "./ws-frames.ts";

const TOKEN = "test-token-0123456789";
let home: Awaited<ReturnType<typeof claudeHome>>;
let project: Awaited<ReturnType<typeof projectFolder>>;
let data: Awaited<ReturnType<typeof tempFolder>>;

beforeAll(async () => {
  home = await claudeHome();
  project = await projectFolder();
  data = await tempFolder();
});

afterAll(async () => {
  await data.dispose();
  await project.dispose();
  await home.dispose();
});

/** `chats.json` in the app's data, read `ms` late, as from a slow disk. */
function slowly(ms: number) {
  const file = fileChatStore(data.dir);
  return {
    ...file,
    load: () => new Promise<Awaited<ReturnType<typeof file.load>>>((r) => setTimeout(() => r(file.load()), ms)),
  };
}

/** The server as the desktop starts it, on the app's data folder. */
async function serve(slowRead = 0) {
  const allowed = createAllowedProjects();
  allowed.set([project.dir]);
  const claude = fakeClaude();
  const logged: string[] = [];
  const services = createServices({
    allowed,
    log: (m) => logged.push(m),
    claude: claude.deps,
    chatStore: slowly(slowRead),
  });
  const server = await startServer({ token: TOKEN, api: services.api, log: (m) => logged.push(m) });
  const socket = await openFrames<ChatList | ChatEvent>(`${server.url}?token=${TOKEN}`);
  return {
    claude,
    logged,
    socket,
    call: async (id: number, method: string, params: Record<string, unknown>) => {
      socket.send({ id, method, params });
      return socket.next((f) => f.id === id);
    },
    stop: async () => {
      socket.close();
      await server.close();
      await services.close();
    },
  };
}

describe("STORY-44: chats come back after a restart", () => {
  it("lists the chat, watches its transcript, and resumes its session", async () => {
    const session = sessionLines(project.dir).session;
    const first = await serve();
    const { id } = (await first.call(1, "chat.start", { dir: project.dir, role: "developer" })).result as {
      id: string;
    };
    await first.call(2, "chat.watch", { id });
    await first.call(3, "chat.send", { id, text: "hello" });
    await until(() => first.claude.runs[0]?.heard.length === 1);
    first.claude.runs[0]!.say(sdk.init("claude-sonnet-5-5", session), sdk.assistant("m1", [sdk.text("Hi.")]));
    first.claude.runs[0]!.say(sdk.success());
    // The turn is recorded, and its session saved, before the app quits.
    await first.socket.next((f) => (f.data as ChatEvent | undefined)?.type === "turn-end");
    await sessionLines(project.dir, session)
      .prompt("hello")
      .reply("m1", [sdk.text("Hi.")])
      .write();
    await first.stop();
    expect(first.logged).toEqual([]);

    const again = await serve();
    try {
      const list = (await again.call(1, "chat.list", { dir: project.dir })).result as ChatList;
      expect(list.chats).toEqual([expect.objectContaining({ id, title: "hello", running: false, waiting: "reply" })]);

      expect((await again.call(2, "chat.watch", { id })).result).toEqual({
        events: [
          { type: "user", text: "hello" },
          { type: "text", block: "m1:0", delta: "Hi." },
          { type: "turn-end", outcome: "done" },
        ],
      });
      expect(again.claude.runs).toEqual([]);

      expect(await again.call(3, "chat.send", { id, text: "again" })).toEqual({ id: 3, ok: true, result: null });
      await until(() => again.claude.runs[0]?.heard.length === 1);
      expect(again.claude.runs[0]!.options.resume).toBe(session);
    } finally {
      await again.stop();
    }
    expect(again.logged).toEqual([]);
  });

  it("answers chat.list with the saved chats, even when the file is read slowly", async () => {
    const again = await serve(300);
    try {
      const list = (await again.call(1, "chat.list", { dir: project.dir })).result as ChatList;
      expect(list.chats.map((c) => c.title)).toEqual(["hello"]);
    } finally {
      await again.stop();
    }
  });
});
