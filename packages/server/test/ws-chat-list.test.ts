/**
 * STORY-21: `chat.list` over the real socket and the real services (ADR 0018). Only the Agent SDK's `query` and the
 * PATH lookup are faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChatList } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { tempFolder } from "./temp-folder.ts";
import { until } from "./until.ts";
import { openFrames } from "./ws-frames.ts";

const TOKEN = "test-token-0123456789";
const allowed = createAllowedProjects();
const logged: string[] = [];
const claude = fakeClaude();
// Where `claude` is found on the PATH: the user can install or remove it while the app runs.
let found: string | null = "/usr/local/bin/claude";
const services = createServices({
  allowed,
  log: (m) => logged.push(m),
  claude: { ...claude.deps, locate: async () => found },
});
let server: RunningServer;
let project: { dir: string; dispose: () => Promise<void> };
const open = () => openFrames<ChatList>(`${server.url}?token=${TOKEN}`);
const CLAUDE = { id: "claude", name: "Claude Code", installed: true };

beforeAll(async () => {
  project = await tempFolder();
  allowed.set([project.dir]);
  server = await startServer({ token: TOKEN, api: services.api, log: (m) => logged.push(m) });
});

afterAll(async () => {
  await server.close();
  await services.close();
  await project.dispose();
});

describe("STORY-21: chat.list", () => {
  it("answers the providers and the project's chats, then pushes the list as chats start, run and wait", async () => {
    const socket = await open();
    try {
      socket.send({ id: 1, method: "chat.list", params: { dir: project.dir } });
      expect(await socket.next((f) => f.id === 1)).toEqual({
        id: 1,
        ok: true,
        result: { providers: [CLAUDE], chats: [] },
      });

      socket.send({ id: 2, method: "chat.start", params: { dir: project.dir, role: "developer" } });
      const { id } = (await socket.next((f) => f.id === 2)).result as { id: string };
      const started = await socket.next((f) => f.event === "chat.list");
      expect(started).toMatchObject({ watch: 1, data: { providers: [CLAUDE] } });
      expect(started.data?.chats).toEqual([
        expect.objectContaining({ id, provider: "claude", title: null, running: false, waiting: null }),
      ]);

      socket.send({ id: 3, method: "chat.send", params: { id, text: "hello" } });
      const sent = await socket.next((f) => f.event === "chat.list" && f.data?.chats[0]?.running === true);
      expect(sent.data?.chats[0]).toMatchObject({ title: "hello", waiting: null });

      await until(() => claude.runs[0]?.heard.length === 1);
      claude.runs[0]!.say(sdk.init(), sdk.start("m1"), sdk.delta("Hi"), sdk.success());
      const ended = await socket.next((f) => f.event === "chat.list" && f.data?.chats[0]?.running === false);
      expect(ended.data?.chats[0]).toMatchObject({ title: "hello", waiting: "reply" });

      socket.send({ id: 4, method: "work.unwatch", params: { watch: 1 } });
      await socket.next((f) => f.id === 4);
      const pushes = socket.frames.filter((f) => f.event === "chat.list").length;
      socket.send({ id: 5, method: "chat.start", params: { dir: project.dir, role: "qa" } });
      await socket.next((f) => f.id === 5);
      expect(socket.frames.filter((f) => f.event === "chat.list")).toHaveLength(pushes);
    } finally {
      socket.close();
    }
    expect(logged).toEqual([]);
  });

  it("finds a provider installed or removed while the app runs, on the list's next push", async () => {
    found = null;
    const socket = await open();
    try {
      socket.send({ id: 7, method: "chat.list", params: { dir: project.dir } });
      const answer = (await socket.next((f) => f.id === 7)).result as ChatList;
      expect(answer.providers).toEqual([{ ...CLAUDE, installed: false }]);
      found = "/usr/local/bin/claude";
      socket.send({ id: 8, method: "chat.start", params: { dir: project.dir, role: "qa" } });
      expect((await socket.next((f) => f.event === "chat.list")).data?.providers).toEqual([CLAUDE]);
    } finally {
      found = "/usr/local/bin/claude";
      socket.close();
    }
  });

  it("refuses a folder that isn't open", async () => {
    const socket = await open();
    try {
      socket.send({ id: 6, method: "chat.list", params: { dir: "/not/open" } });
      expect(await socket.next((f) => f.id === 6)).toEqual({ id: 6, ok: false, error: "Not an open project." });
    } finally {
      socket.close();
    }
  });
});
