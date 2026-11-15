import { afterEach, describe, expect, it, vi } from "vitest";
import { REWATCH_MS, SERVER_LOST, serverWork, type WorkUpdate } from "../src/bridge.ts";
import { setup, type FakeSocket } from "./fake-socket.ts";

/** `work.watch` over the real client (ADR 0016): the answer, pushes by watch id, unwatch, and a dropped connection. */
afterEach(() => vi.useRealTimers());

const LIST = { epics: [], stale: [], problems: [] };
const withTitle = (title: string) => ({
  ...LIST,
  epics: [{ id: "EPIC-1", title, progress: { done: 0, total: 0, label: "" }, bar: [], breakdown: "", features: [] }],
});
const titles = (updates: WorkUpdate[]) => updates.map((u) => u.list.epics[0]?.title ?? null);

async function watching() {
  const s = setup();
  const updates: WorkUpdate[] = [];
  const stop = serverWork(s.client).watch("/p", (u) => updates.push(u));
  const ws = await s.socket();
  ws.open();
  await expect.poll(() => ws.sent.length).toBe(1);
  return { ...s, ws, updates, stop };
}

const push = (ws: FakeSocket, watch: number, data: unknown) => ws.answer({ event: "work.list", watch, data });

describe("work.watch over the client", () => {
  it("sends one watch request, hears the answer, then each push for that watch only", async () => {
    const { ws, updates } = await watching();
    expect(ws.sent).toEqual([{ id: 1, method: "work.watch", params: { dir: "/p" } }]);
    ws.answer({ id: 1, ok: true, result: withTitle("first") });
    await expect.poll(() => titles(updates)).toEqual(["first"]);
    push(ws, 1, withTitle("second"));
    push(ws, 99, withTitle("someone else's"));
    expect(titles(updates)).toEqual(["first", "second"]);
    expect(updates.every((u) => u.error === null)).toBe(true);
  });

  it("routes a push that arrives before the answer", async () => {
    const { ws, updates } = await watching();
    push(ws, 1, withTitle("early"));
    ws.answer({ id: 1, ok: true, result: withTitle("answer") });
    await expect.poll(() => titles(updates)).toEqual(["early", "answer"]);
  });

  it("stopping sends work.unwatch and ignores later pushes", async () => {
    const { ws, updates, stop } = await watching();
    ws.answer({ id: 1, ok: true, result: withTitle("first") });
    await expect.poll(() => updates.length).toBe(1);
    stop();
    await expect.poll(() => ws.sent.at(-1)).toEqual({ id: 2, method: "work.unwatch", params: { watch: 1 } });
    push(ws, 1, withTitle("after stop"));
    expect(titles(updates)).toEqual(["first"]);
  });

  it("a dropped connection keeps the last list with why, then watches again on a new socket", async () => {
    const { ws, updates, sockets } = await watching();
    ws.answer({ id: 1, ok: true, result: withTitle("before") });
    await expect.poll(() => updates.length).toBe(1);
    vi.useFakeTimers();
    ws.emit("close", {});
    await vi.advanceTimersByTimeAsync(0);
    expect(updates.at(-1)).toEqual({ list: withTitle("before"), error: SERVER_LOST });
    expect(updates).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(REWATCH_MS);
    vi.useRealTimers();
    await expect.poll(() => sockets.length).toBe(2);
    const next = sockets[1] as FakeSocket;
    next.open();
    await expect.poll(() => next.sent).toEqual([{ id: 2, method: "work.watch", params: { dir: "/p" } }]);
    next.answer({ id: 2, ok: true, result: withTitle("after") });
    await expect.poll(() => updates.at(-1)).toEqual({ list: withTitle("after"), error: null });
  });

  it("a refused watch says why and tries again later", async () => {
    const { ws, updates } = await watching();
    vi.useFakeTimers();
    ws.answer({ id: 1, ok: false, error: "Not an open project." });
    await vi.advanceTimersByTimeAsync(0);
    expect(updates).toEqual([{ list: LIST, error: "Not an open project." }]);
    await vi.advanceTimersByTimeAsync(REWATCH_MS);
    vi.useRealTimers();
    await expect.poll(() => ws.sent.at(-1)).toEqual({ id: 2, method: "work.watch", params: { dir: "/p" } });
  });

  it("close() stops every watch", async () => {
    const { client, ws, updates } = await watching();
    client.close();
    push(ws, 1, withTitle("after close"));
    expect(updates).toEqual([]);
  });
});

describe("apply and discard over the client", () => {
  it.each([
    ["applyCopy", "work.applyCopy"],
    ["discardCopy", "work.discardCopy"],
  ] as const)("%s sends %s and checks the answer", async (name, method) => {
    const { client, socket } = setup();
    const done = serverWork(client)[name]("/p", "main|x.md");
    const ws = await socket();
    ws.open();
    await expect.poll(() => ws.sent).toEqual([{ id: 1, method, params: { dir: "/p", key: "main|x.md" } }]);
    ws.answer({ id: 1, ok: true, result: { ok: false, error: "Changed on both sides." } });
    expect(await done).toEqual({ ok: false, error: "Changed on both sides." });
  });

  it("a transport failure is a result the list can show", async () => {
    const { client, socket } = setup();
    const done = serverWork(client).applyCopy("/p", "main|x.md");
    (await socket()).emit("error", {});
    expect(await done).toMatchObject({ ok: false });
  });
});
