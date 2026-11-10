/**
 * STORY-7: `inbox.watch` and `inbox.asked` over the real socket and the real services (ADR 0018). Only the Agent SDK's
 * `query` (and its `canUseTool` calls) and the PATH lookup are fake. A wait of 0 makes a request due at once, so no test
 * waits; the waits are proved against a hand-moved clock in inbox.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChatEvent, Inbox, InboxItem } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { tempFolder } from "./temp-folder.ts";
import { until } from "./until.ts";
import { openFrames } from "./ws-frames.ts";

const TOKEN = "test-token-0123456789";
const BASH = { command: "npm test" };
const DAY = 24 * 60 * 60_000;
const allowed = createAllowedProjects();
const claude = fakeClaude("/usr/local/bin/claude");
const services = createServices({ allowed, log: () => {}, claude: claude.deps });
let server: RunningServer;
let project: { dir: string; dispose: () => Promise<void> };
const open = () => openFrames<ChatEvent | Inbox | InboxItem>(`${server.url}?token=${TOKEN}`);

beforeAll(async () => {
  project = await tempFolder();
  allowed.set([project.dir]);
  server = await startServer({ token: TOKEN, api: services.api, log: () => {} });
});

afterAll(async () => {
  await server.close();
  await services.close();
  await project.dispose();
});

describe("STORY-7: inbox.watch, inbox.asked", () => {
  it("answers with the Inbox, pushes each change, and clears an item the chat's own chat.approve answers", async () => {
    const socket = await open();
    try {
      socket.send({ id: 1, method: "chat.start", params: { dir: project.dir, role: "developer", card: "STORY-9" } });
      const { id } = (await socket.next((f) => f.id === 1)).result as { id: string };
      socket.send({ id: 2, method: "inbox.watch", params: { dir: project.dir, waitMs: 0 } });
      expect(await socket.next((f) => f.id === 2)).toEqual({ id: 2, ok: true, result: { items: [] } });
      socket.send({ id: 3, method: "inbox.watch", params: { dir: project.dir, waitMs: DAY } });
      expect((await socket.next((f) => f.id === 3)).ok).toBe(true);
      socket.send({ id: 4, method: "inbox.asked", params: { dir: project.dir } });
      expect((await socket.next((f) => f.id === 4)).result).toBeNull();
      socket.send({ id: 5, method: "chat.send", params: { id, text: "test it" } });
      await socket.next((f) => f.id === 5);
      await until(() => claude.runs[0]?.heard.length === 1);
      const run = claude.runs[0]!;
      run.say(sdk.init(), sdk.assistant("m1", [sdk.toolUse("t1", "Bash", BASH)]));
      const asked = run.ask("Bash", BASH, "t1");

      // Every watcher hears the request as it is asked; the one with the long wait doesn't list it yet.
      const pushed = await socket.next((f) => f.event === "inbox.asked");
      expect(pushed.data).toMatchObject({ chat: id, card: "STORY-9", request: { type: "approval", id: "t1" } });
      const listed = await socket.next((f) => f.event === "inbox.list" && f.watch === 2);
      expect((listed.data as Inbox).items.map((i) => i.chat)).toEqual([id]);
      expect(socket.frames.some((f) => f.event === "inbox.list" && f.watch === 3)).toBe(false);

      // The Inbox answers through chat.approve, the chat's own path.
      socket.send({ id: 6, method: "chat.approve", params: { id, tool: "t1", choice: "allow" } });
      expect(await socket.next((f) => f.id === 6)).toEqual({ id: 6, ok: true, result: null });
      expect(await asked).toMatchObject({ behavior: "allow" });
      const cleared = await socket.next((f) => f.event === "inbox.list" && f.watch === 2);
      expect(cleared.data).toEqual({ items: [] });
      socket.send({ id: 7, method: "chat.approve", params: { id, tool: "t1", choice: "deny" } });
      expect((await socket.next((f) => f.id === 7)).ok).toBe(false);
    } finally {
      socket.close();
    }
  });

  it("refuses bad params and a folder that isn't an open project", async () => {
    const socket = await open();
    try {
      socket.send({ id: 1, method: "inbox.watch", params: { dir: project.dir } });
      expect(await socket.next((f) => f.id === 1)).toEqual({ id: 1, ok: false, error: "Expected { dir, waitMs }." });
      socket.send({ id: 2, method: "inbox.watch", params: { dir: project.dir, waitMs: -1 } });
      expect((await socket.next((f) => f.id === 2)).ok).toBe(false);
      socket.send({ id: 3, method: "inbox.watch", params: { dir: "/not/open", waitMs: 0 } });
      expect((await socket.next((f) => f.id === 3)).ok).toBe(false);
      socket.send({ id: 4, method: "inbox.asked", params: { dir: "/not/open" } });
      expect((await socket.next((f) => f.id === 4)).ok).toBe(false);
    } finally {
      socket.close();
    }
  });
});
