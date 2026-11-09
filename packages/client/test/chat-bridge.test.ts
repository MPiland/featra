/** STORY-5: the chat bridge over the real server client (ADR 0018). Only the network is faked. */
import { describe, expect, it } from "vitest";
import { BUILT_IN_ROLES } from "@featra/work-format/roles";
import { serverChats, type ChatUpdate } from "../src/bridge.ts";
import { setup, type FakeSocket } from "./fake-socket.ts";

const texts = (u: ChatUpdate | undefined) => u?.chat.items.map((i) => ("text" in i ? i.text : i.kind));
const push = (ws: FakeSocket, watch: number, data: unknown) => ws.answer({ event: "chat.event", watch, data });

async function watching() {
  const s = setup();
  const updates: ChatUpdate[] = [];
  const stop = serverChats(s.client).watch("c1", (u) => updates.push(u));
  const ws = await s.socket();
  ws.open();
  await expect.poll(() => ws.sent.length).toBe(1);
  return { ...s, ws, updates, stop };
}

describe("chat.watch over the client", () => {
  it("folds the log it answers with, then each pushed event", async () => {
    const { ws, updates } = await watching();
    expect(ws.sent).toEqual([{ id: 1, method: "chat.watch", params: { id: "c1" } }]);
    ws.answer({ id: 1, ok: true, result: { events: [{ type: "user", text: "hi" }] } });
    await expect.poll(() => texts(updates.at(-1))).toEqual(["hi"]);
    push(ws, 1, { type: "text", block: "m1:0", delta: "Hel" });
    push(ws, 1, { type: "text", block: "m1:0", delta: "lo" });
    expect(texts(updates.at(-1))).toEqual(["hi", "Hello"]);
    expect(updates.at(-1)?.chat.running).toBe(true);
  });

  it("keeps a push that beats the answer, after the log", async () => {
    const { ws, updates } = await watching();
    push(ws, 1, { type: "text", block: "m1:0", delta: "early" });
    ws.answer({ id: 1, ok: true, result: { events: [{ type: "user", text: "hi" }] } });
    await expect.poll(() => texts(updates.at(-1))).toEqual(["hi", "early"]);
  });

  it("ignores a malformed push", async () => {
    const { ws, updates } = await watching();
    ws.answer({ id: 1, ok: true, result: { events: [] } });
    await expect.poll(() => updates.length).toBe(1);
    push(ws, 1, { type: "text" });
    expect(updates).toHaveLength(1);
  });
});

describe("the chat calls", () => {
  it("lists roles, starts a chat, sends and stops", async () => {
    const s = setup();
    const chats = serverChats(s.client);
    const roles = chats.roles("/p");
    const ws = await s.socket();
    ws.open();
    await expect.poll(() => ws.sent.length).toBe(1);
    ws.answer({ id: 1, ok: true, result: BUILT_IN_ROLES });
    expect(await roles).toEqual(BUILT_IN_ROLES);

    const started = chats.start("/p", "qa");
    await expect.poll(() => ws.sent.length).toBe(2);
    ws.answer({ id: 2, ok: true, result: { id: "c9" } });
    expect(await started).toEqual({ ok: true, id: "c9" });

    const sent = chats.send("c9", "hello");
    await expect.poll(() => ws.sent.length).toBe(3);
    ws.answer({ id: 3, ok: false, error: "Wait for the reply, or stop it." });
    expect(await sent).toBe("Wait for the reply, or stop it.");

    const stopped = chats.stop("c9");
    await expect.poll(() => ws.sent.length).toBe(4);
    ws.answer({ id: 4, ok: true, result: null });
    await stopped;
    expect(ws.sent.map((f) => [f.method, f.params])).toEqual([
      ["chat.roles", { dir: "/p" }],
      ["chat.start", { dir: "/p", role: "qa" }],
      ["chat.send", { id: "c9", text: "hello" }],
      ["chat.stop", { id: "c9" }],
    ]);
  });

  it("turns a refused start into its message", async () => {
    const s = setup();
    const started = serverChats(s.client).start("/p", "nobody");
    const ws = await s.socket();
    ws.open();
    await expect.poll(() => ws.sent.length).toBe(1);
    ws.answer({ id: 1, ok: false, error: "No such role." });
    expect(await started).toEqual({ ok: false, error: "No such role." });
  });
});
