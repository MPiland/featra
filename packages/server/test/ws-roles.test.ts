/**
 * STORY-6 over the real socket and the real services (ADR 0015): the roles methods, and a chat started from a
 * provider's role. Only the Agent SDK's `query` and the folders are the test's own.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChatSnapshot, RoleEditResult, RoleList } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { fakeClaude } from "./fake-query.ts";
import { CODEX_AGENT, roleWorld, settings } from "./role-world.ts";
import { until } from "./until.ts";
import { openFrames } from "./ws-frames.ts";

const TOKEN = "test-token-0123456789";
const allowed = createAllowedProjects();
const logged: string[] = [];
const claude = fakeClaude("/usr/local/bin/claude");
let world: Awaited<ReturnType<typeof roleWorld>>;
let services: ReturnType<typeof createServices>;
let server: RunningServer;
const open = () => openFrames<unknown>(`${server.url}?token=${TOKEN}`);

beforeAll(async () => {
  world = await roleWorld();
  services = createServices({ allowed, log: (m) => logged.push(m), claude: claude.deps, roleFs: world.fs });
  allowed.set([world.dir]);
  server = await startServer({ token: TOKEN, api: services.api, log: (m) => logged.push(m) });
});

afterAll(async () => {
  await server.close();
  await services.close();
  await world.dispose();
});

describe("STORY-6: roles.watch, roles.edit and chats from a role", () => {
  it("lists the roles, edits one, and pushes the changed list to the watcher (AC1, AC2)", async () => {
    const socket = await open();
    try {
      socket.send({ id: 1, method: "roles.watch", params: { dir: world.dir } });
      const first = (await socket.next((f) => f.id === 1)).result as RoleList;
      expect(first.roles.map((r) => r.id)).toEqual(["researcher", "analyst", "dev-lead", "developer", "qa"]);
      expect(first.problems).toEqual([]);

      socket.send({
        id: 2,
        method: "roles.edit",
        params: {
          dir: world.dir,
          edit: { action: "save", id: "qa", prompt: "Be picky.", model: "opus", effort: "max" },
        },
      });
      expect((await socket.next((f) => f.id === 2)).result).toEqual({ ok: true, id: "qa" } satisfies RoleEditResult);
      const pushed = await socket.next((f) => f.event === "roles.list");
      expect(pushed.watch).toBe(1);
      expect((pushed.data as RoleList).roles.find((r) => r.id === "qa")).toMatchObject({
        prompt: "Be picky.",
        source: { kind: "built-in", edited: true },
      });
      expect(await world.exists(world.dir, ".featra/roles/qa.md")).toBe(true);

      socket.send({ id: 3, method: "work.unwatch", params: { watch: 1 } });
      await socket.next((f) => f.id === 3);
    } finally {
      socket.close();
    }
  });

  it("refuses an edit it can't do, a closed folder and malformed params, as errors", async () => {
    const socket = await open();
    try {
      socket.send({ id: 4, method: "roles.edit", params: { dir: world.dir, edit: { action: "delete", id: "qa" } } });
      expect((await socket.next((f) => f.id === 4)).result).toMatchObject({ ok: false });
      socket.send({ id: 5, method: "roles.edit", params: { dir: "/not/open", edit: { action: "create", name: "x" } } });
      expect(await socket.next((f) => f.id === 5)).toEqual({ id: 5, ok: false, error: "Not an open project." });
      socket.send({ id: 6, method: "roles.edit", params: { dir: world.dir, edit: { action: "nuke" } } });
      expect(await socket.next((f) => f.id === 6)).toMatchObject({ id: 6, ok: false });
      socket.send({ id: 7, method: "roles.watch", params: {} });
      expect(await socket.next((f) => f.id === 7)).toMatchObject({ id: 7, ok: false });
    } finally {
      socket.close();
    }
  });

  it("starts a Claude session from a Codex agent, with its prompt, Claude's default model and a note (AC5)", async () => {
    await world.put(world.dir, ".codex/agents/scout.toml", CODEX_AGENT);
    const socket = await open();
    try {
      socket.send({ id: 10, method: "chat.start", params: { dir: world.dir, role: "codex:project:scout" } });
      const { id } = (await socket.next((f) => f.id === 10)).result as { id: string };
      socket.send({ id: 11, method: "chat.watch", params: { id } });
      const snapshot = (await socket.next((f) => f.id === 11)).result as ChatSnapshot;
      expect(snapshot.note).toBe("Claude doesn't have the model \"gpt-5\": using Claude's default.");
      expect(snapshot).not.toHaveProperty("mode");
      socket.send({ id: 12, method: "chat.send", params: { id, text: "hi" } });
      await until(() => claude.runs.length === 1);
      const { options } = claude.runs[0]!;
      expect(options.model).toBe("default");
      expect(options.systemPrompt).toMatchObject({ append: "Look around." });
    } finally {
      socket.close();
    }
  });

  it("tells a chat watcher the mode from the provider's settings, as the provider names it (AC6, AC7)", async () => {
    await world.put(world.home, ".claude/settings.json", settings("acceptEdits"));
    const socket = await open();
    try {
      socket.send({ id: 20, method: "chat.start", params: { dir: world.dir, role: "developer" } });
      const { id } = (await socket.next((f) => f.id === 20)).result as { id: string };
      socket.send({ id: 21, method: "chat.watch", params: { id } });
      const snapshot = (await socket.next((f) => f.id === 21)).result as ChatSnapshot;
      expect(snapshot.mode).toEqual({ provider: "claude", name: "acceptEdits", level: "user", fullAccess: false });
      socket.send({ id: 22, method: "chat.send", params: { id, text: "go" } });
      await until(() => claude.runs.length === 2);
      expect(claude.runs[1]!.options.permissionMode).toBe("acceptEdits");
    } finally {
      socket.close();
    }
    expect(logged).toEqual([]);
  });
});
