/**
 * STORY-22: `chat.controls` and `chat.configure` over the real socket and the real services (ADR 0015). Only the Agent
 * SDK's `query` and the PATH lookup are faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { tempFolder } from "./temp-folder.ts";
import { until } from "./until.ts";
import { openFrames } from "./ws-frames.ts";

const TOKEN = "test-token-0123456789";
const allowed = createAllowedProjects();
const claude = fakeClaude("/usr/local/bin/claude");
const services = createServices({ allowed, log: () => {}, claude: claude.deps });
let server: RunningServer;
let project: { dir: string; dispose: () => Promise<void> };

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

describe("chat.controls and chat.configure", () => {
  it("answers the controls, takes a change, applies it to the next turn, and refuses what isn't offered", async () => {
    const socket = await openFrames(`${server.url}?token=${TOKEN}`);
    try {
      socket.send({ id: 1, method: "chat.start", params: { dir: project.dir, role: "developer" } });
      const { id } = (await socket.next((f) => f.id === 1)).result as { id: string };

      socket.send({ id: 2, method: "chat.controls", params: { id } });
      const first = (await socket.next((f) => f.id === 2)).result as {
        settings: unknown;
        controls: { modes: unknown[] };
      };
      expect(first.settings).toEqual({ role: "developer", model: "sonnet", effort: "high", mode: "default" });
      expect(first.controls.modes).toHaveLength(5);

      socket.send({ id: 3, method: "chat.configure", params: { id, change: { model: "opus", mode: "acceptEdits" } } });
      const changed = await socket.next((f) => f.id === 3);
      expect(changed.result).toMatchObject({ settings: { model: "opus", effort: "high", mode: "acceptEdits" } });

      socket.send({ id: 4, method: "chat.send", params: { id, text: "go" } });
      await socket.next((f) => f.id === 4);
      await until(() => claude.runs[0]?.heard.length === 1);
      expect(claude.runs[0]?.options).toMatchObject({ model: "opus", permissionMode: "acceptEdits" });
      claude.runs[0]!.say(sdk.init(), sdk.success(""));

      socket.send({ id: 5, method: "chat.configure", params: { id, change: { model: "gpt-5" } } });
      expect(await socket.next((f) => f.id === 5)).toMatchObject({ ok: false, error: "The agent doesn't offer that." });
      socket.send({ id: 6, method: "chat.configure", params: { id, change: {} } });
      expect((await socket.next((f) => f.id === 6)).ok).toBe(false);
      socket.send({ id: 7, method: "chat.configure", params: { id } });
      expect((await socket.next((f) => f.id === 7)).ok).toBe(false);
    } finally {
      socket.close();
    }
  });
});
