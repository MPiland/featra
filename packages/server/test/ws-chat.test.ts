/**
 * STORY-5: the chat methods over the real socket and the real services (ADR 0015, ADR 0018). Only the Agent SDK's
 * `query` and the PATH lookup are faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUILT_IN_ROLES, CHAT_MESSAGES, type ChatEvent } from "@featra/work-format";
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
const claude = fakeClaude("/usr/local/bin/claude");
const services = createServices({ allowed, log: (m) => logged.push(m), claude: claude.deps });
let server: RunningServer;
let project: { dir: string; dispose: () => Promise<void> };
const open = () => openFrames<ChatEvent>(`${server.url}?token=${TOKEN}`);

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

describe("STORY-5: chat.roles, chat.start, chat.watch, chat.send and chat.stop", () => {
  it("lists the five built-in roles, each in Ask (AC5)", async () => {
    const socket = await open();
    try {
      socket.send({ id: 1, method: "chat.roles", params: { dir: project.dir } });
      const answer = await socket.next((f) => f.id === 1);
      expect(answer.ok).toBe(true);
      expect(answer.result).toEqual(BUILT_IN_ROLES);
      const roles = answer.result as { name: string; permission: string }[];
      expect(roles.map((r) => r.name)).toEqual(["Researcher", "Analyst/Refiner", "Dev Lead", "Developer", "QA"]);
      expect(roles.every((r) => r.permission === "ask")).toBe(true);
    } finally {
      socket.close();
    }
  });

  it("starts a chat, streams its events to a watcher, and stops its turn (AC1, AC2)", async () => {
    const socket = await open();
    try {
      socket.send({ id: 2, method: "chat.start", params: { dir: project.dir, role: "researcher" } });
      const started = await socket.next((f) => f.id === 2);
      const { id } = started.result as { id: string };
      expect(typeof id).toBe("string");

      socket.send({ id: 3, method: "chat.watch", params: { id } });
      expect(await socket.next((f) => f.id === 3)).toEqual({ id: 3, ok: true, result: { events: [] } });

      socket.send({ id: 4, method: "chat.send", params: { id, text: "find the tests" } });
      expect(await socket.next((f) => f.id === 4)).toEqual({ id: 4, ok: true, result: null });
      expect(await socket.next((f) => f.event === "chat.event")).toEqual({
        event: "chat.event",
        watch: 3,
        data: { type: "user", text: "find the tests" },
      });
      await until(() => claude.runs[0]?.heard.length === 1);
      expect(claude.runs[0]?.options.cwd).toBe(project.dir);
      claude.runs[0]!.say(sdk.init(), sdk.start("m1"), sdk.delta("Looking"));
      expect((await socket.next((f) => f.data?.type === "text")).data).toEqual({
        type: "text",
        block: "m1:0",
        delta: "Looking",
      });

      socket.send({ id: 5, method: "chat.send", params: { id, text: "and more" } });
      expect(await socket.next((f) => f.id === 5)).toEqual({ id: 5, ok: false, error: CHAT_MESSAGES.busy });

      socket.send({ id: 6, method: "chat.stop", params: { id } });
      expect(await socket.next((f) => f.id === 6)).toEqual({ id: 6, ok: true, result: null });
      expect(claude.runs[0]?.interrupts).toBe(1);
      claude.runs[0]!.say(sdk.failure());
      expect((await socket.next((f) => f.data?.type === "turn-end")).data).toEqual({
        type: "turn-end",
        outcome: "stopped",
      });

      // A second watcher replays the log so far.
      socket.send({ id: 7, method: "chat.watch", params: { id } });
      const replay = await socket.next((f) => f.id === 7);
      expect((replay.result as { events: ChatEvent[] }).events.map((e) => e.type)).toEqual([
        "user",
        "started",
        "text",
        "turn-end",
      ]);
    } finally {
      socket.close();
    }
    expect(logged).toEqual([]);
  });

  it("refuses a folder that isn't open, an unknown role or chat, and a blank message", async () => {
    const socket = await open();
    try {
      socket.send({ id: 8, method: "chat.start", params: { dir: "/not/open", role: "qa" } });
      expect(await socket.next((f) => f.id === 8)).toEqual({ id: 8, ok: false, error: "Not an open project." });
      socket.send({ id: 9, method: "chat.start", params: { dir: project.dir, role: "nobody" } });
      expect(await socket.next((f) => f.id === 9)).toEqual({ id: 9, ok: false, error: CHAT_MESSAGES.unknownRole });
      socket.send({ id: 10, method: "chat.watch", params: { id: "nope" } });
      expect(await socket.next((f) => f.id === 10)).toEqual({ id: 10, ok: false, error: CHAT_MESSAGES.noChat });
      socket.send({ id: 11, method: "chat.start", params: { dir: project.dir, role: "qa" } });
      const { id } = (await socket.next((f) => f.id === 11)).result as { id: string };
      socket.send({ id: 12, method: "chat.send", params: { id, text: "  " } });
      expect(await socket.next((f) => f.id === 12)).toMatchObject({ id: 12, ok: false });
    } finally {
      socket.close();
    }
    expect(logged).toEqual([]);
  });

  it("ends a project's chats when the project is closed, and pushes no more of their events", async () => {
    const socket = await open();
    const n = claude.runs.length;
    try {
      socket.send({ id: 13, method: "chat.start", params: { dir: project.dir, role: "developer" } });
      const { id } = (await socket.next((f) => f.id === 13)).result as { id: string };
      socket.send({ id: 14, method: "chat.watch", params: { id } });
      await socket.next((f) => f.id === 14);
      socket.send({ id: 15, method: "chat.send", params: { id, text: "hi" } });
      await until(() => claude.runs[n]?.heard.length === 1);
      const run = claude.runs[n]!;
      run.say(sdk.init(), sdk.start("m1"), sdk.delta("Before"));
      await socket.next((f) => f.data?.type === "text");

      allowed.set([]);
      await until(() => run.closed);
      run.say(sdk.delta("After"));
      socket.send({ id: 16, method: "chat.send", params: { id, text: "more" } });
      expect(await socket.next((f) => f.id === 16)).toEqual({ id: 16, ok: false, error: CHAT_MESSAGES.noChat });
      expect(socket.frames.filter((f) => f.event === "chat.event" && f.data?.type === "text")).toEqual([]);
    } finally {
      allowed.set([project.dir]);
      socket.close();
    }
    expect(logged).toEqual([]);
  });
});
