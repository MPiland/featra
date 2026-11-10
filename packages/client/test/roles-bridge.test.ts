/** STORY-6: the roles bridge, and the mode a chat watch hears, over the real server client. Only the network is faked. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BUILT_IN_ROLES } from "@featra/work-format/roles";
import { noRoles, serverChats, serverRoles, type ChatUpdate, type RolesUpdate } from "../src/bridge.ts";
import { setup } from "./fake-socket.ts";

afterEach(() => vi.useRealTimers());

const CLAUDE_AUTO = { provider: "claude", name: "auto", level: "user", fullAccess: false };

async function watchingRoles() {
  const s = setup();
  const updates: RolesUpdate[] = [];
  const roles = serverRoles(s.client);
  const stop = roles.watch("/p", (u) => updates.push(u));
  const ws = await s.socket();
  ws.open();
  await expect.poll(() => ws.sent.length).toBe(1);
  return { ...s, ws, roles, updates, stop };
}

describe("AC1: roles.watch over the client", () => {
  it("hears the roles with the files that couldn't be read, then each push", async () => {
    const { ws, updates } = await watchingRoles();
    expect(ws.sent).toEqual([{ id: 1, method: "roles.watch", params: { dir: "/p" } }]);
    ws.answer({ id: 1, ok: true, result: { roles: BUILT_IN_ROLES, problems: ["a.md: no frontmatter"] } });
    await expect.poll(() => updates.length).toBe(1);
    expect(updates[0]?.list.roles.map((r) => r.id)).toEqual(BUILT_IN_ROLES.map((r) => r.id));
    expect(updates[0]?.list.problems).toEqual(["a.md: no frontmatter"]);
    ws.answer({ event: "roles.list", watch: 1, data: { roles: BUILT_IN_ROLES.slice(0, 2), problems: [] } });
    expect(updates.at(-1)?.list.roles).toHaveLength(2);
    expect(updates.every((u) => u.error === null)).toBe(true);
  });

  it("says why a refused watch has no roles", async () => {
    const { ws, updates } = await watchingRoles();
    vi.useFakeTimers();
    ws.answer({ id: 1, ok: false, error: "Not an open project." });
    await vi.advanceTimersByTimeAsync(0);
    expect(updates).toEqual([{ list: { roles: [], problems: [] }, error: "Not an open project." }]);
    vi.useRealTimers();
  });

  it("stops listening when stopped", async () => {
    const { ws, updates, stop } = await watchingRoles();
    ws.answer({ id: 1, ok: true, result: { roles: BUILT_IN_ROLES, problems: [] } });
    await expect.poll(() => updates.length).toBe(1);
    stop();
    ws.answer({ event: "roles.list", watch: 1, data: { roles: [], problems: [] } });
    expect(updates).toHaveLength(1);
  });
});

describe("AC2, AC3, AC4: roles.edit over the client", () => {
  it("sends the edit and answers with the role it made, or why it was refused", async () => {
    const { ws, roles } = await watchingRoles();
    const saved = roles.edit("/p", { action: "reset", id: "qa" });
    await expect.poll(() => ws.sent.length).toBe(2);
    expect(ws.sent[1]).toEqual({
      id: 2,
      method: "roles.edit",
      params: { dir: "/p", edit: { action: "reset", id: "qa" } },
    });
    ws.answer({ id: 2, ok: true, result: { ok: true, id: "qa" } });
    expect(await saved).toEqual({ ok: true, id: "qa" });

    const refused = roles.edit("/p", { action: "delete", id: "qa" });
    await expect.poll(() => ws.sent.length).toBe(3);
    ws.answer({ id: 3, ok: true, result: { ok: false, error: "Only a custom role can be deleted." } });
    expect(await refused).toEqual({ ok: false, error: "Only a custom role can be deleted." });

    const failed = roles.edit("/p", { action: "create", name: "x" });
    await expect.poll(() => ws.sent.length).toBe(4);
    ws.answer({ id: 4, ok: false, error: "Not an open project." });
    expect(await failed).toEqual({ ok: false, error: "Not an open project." });
  });
});

describe("a browser tab has no folders", () => {
  it("lists no roles with why, and refuses every edit", async () => {
    const heard: RolesUpdate[] = [];
    const bridge = noRoles("No folders here.");
    bridge.watch("/p", (u) => heard.push(u))();
    expect(heard).toEqual([{ list: { roles: [], problems: [] }, error: "No folders here." }]);
    expect(await bridge.edit("/p", { action: "create", name: "x" })).toEqual({ ok: false, error: "No folders here." });
  });
});

async function watchingChat() {
  const s = setup();
  const updates: ChatUpdate[] = [];
  serverChats(s.client).watch("c1", (u) => updates.push(u));
  const ws = await s.socket();
  ws.open();
  await expect.poll(() => ws.sent.length).toBe(1);
  return { ws, updates };
}

describe("AC6, AC7: chat.watch hears the mode and the note", () => {
  it("carries the provider's mode and the note on every update after the snapshot", async () => {
    const { ws, updates } = await watchingChat();
    ws.answer({ id: 1, ok: true, result: { events: [], mode: CLAUDE_AUTO, note: "Claude doesn't have the model." } });
    await expect.poll(() => updates.length).toBe(1);
    ws.answer({ event: "chat.event", watch: 1, data: { type: "user", text: "hi" } });
    for (const u of updates) {
      expect(u.mode).toEqual(CLAUDE_AUTO);
      expect(u.note).toBe("Claude doesn't have the model.");
    }
    expect(updates).toHaveLength(2);
  });

  it("has neither when the snapshot names none, and ignores a malformed mode", async () => {
    const { ws, updates } = await watchingChat();
    ws.answer({ id: 1, ok: true, result: { events: [], mode: { name: "auto" } } });
    await expect.poll(() => updates.length).toBe(1);
    expect(updates[0]).not.toHaveProperty("mode");
    expect(updates[0]).not.toHaveProperty("note");
  });
});
