/**
 * STORY-45: `chat.approve` over the real socket and the real services (ADR 0018). Only the Agent SDK's `query` (and its
 * `canUseTool` calls) and the PATH lookup are faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHAT_MESSAGES, denyMessage, type ChatEvent } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { tempFolder } from "./temp-folder.ts";
import { until } from "./until.ts";
import { openFrames } from "./ws-frames.ts";

const TOKEN = "test-token-0123456789";
const BASH = { command: "npm test" };
const allowed = createAllowedProjects();
const claude = fakeClaude("/usr/local/bin/claude");
const services = createServices({ allowed, log: () => {}, claude: claude.deps });
let server: RunningServer;
let project: { dir: string; dispose: () => Promise<void> };
const open = () => openFrames<ChatEvent>(`${server.url}?token=${TOKEN}`);

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

describe("STORY-45: chat.approve", () => {
  it("pushes the request to a watcher, takes a Deny with its reason, and refuses what isn't asked", async () => {
    const socket = await open();
    try {
      socket.send({ id: 1, method: "chat.start", params: { dir: project.dir, role: "developer" } });
      const { id } = (await socket.next((f) => f.id === 1)).result as { id: string };
      socket.send({ id: 2, method: "chat.watch", params: { id } });
      await socket.next((f) => f.id === 2);
      socket.send({ id: 3, method: "chat.send", params: { id, text: "test it" } });
      await socket.next((f) => f.id === 3);
      await until(() => claude.runs[0]?.heard.length === 1);
      const run = claude.runs[0]!;
      run.say(sdk.init(), sdk.assistant("m1", [sdk.toolUse("t1", "Bash", BASH)]));
      await socket.next((f) => f.data?.type === "tool");
      const asked = run.ask("Bash", BASH, "t1");
      expect((await socket.next((f) => f.data?.type === "approval")).data).toEqual({
        type: "approval",
        id: "t1",
        name: "Bash",
        input: BASH,
        forChat: true,
        covers: "This command: npm test",
      });

      socket.send({ id: 4, method: "chat.approve", params: { id, tool: "t1", choice: "maybe" } });
      expect(await socket.next((f) => f.id === 4)).toMatchObject({
        ok: false,
        error: "Expected { id, tool, choice, reason? }.",
      });
      socket.send({ id: 5, method: "chat.approve", params: { id, tool: "t9", choice: "allow" } });
      expect(await socket.next((f) => f.id === 5)).toEqual({ id: 5, ok: false, error: CHAT_MESSAGES.noRequest });
      socket.send({ id: 6, method: "chat.approve", params: { id: "nope", tool: "t1", choice: "allow" } });
      expect(await socket.next((f) => f.id === 6)).toEqual({ id: 6, ok: false, error: CHAT_MESSAGES.noChat });

      socket.send({
        id: 7,
        method: "chat.approve",
        params: { id, tool: "t1", choice: "deny", reason: " Unit only. " },
      });
      expect(await socket.next((f) => f.id === 7)).toEqual({ id: 7, ok: true, result: null });
      expect(await asked).toEqual({ behavior: "deny", message: denyMessage("Unit only.") });
      expect((await socket.next((f) => f.data?.type === "tool-denied")).data).toEqual({
        type: "tool-denied",
        id: "t1",
        name: "Bash",
        input: BASH,
        reason: "Unit only.",
      });
    } finally {
      socket.close();
    }
  });
});
