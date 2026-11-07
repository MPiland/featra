import { describe, expect, it } from "vitest";
import { SERVER_LOST, SERVER_UNAVAILABLE, normalizeEndpoint, serverSetup } from "../src/bridge.ts";
import { ENDPOINT, setup, type FakeSocket } from "./fake-socket.ts";

describe("the server client", () => {
  it("connects with the token in the query, sends one request per call and resolves with its result", async () => {
    const { client, socket } = setup();
    const call = client.call("project.setupStatus", { dir: "/p" });
    const ws = await socket();
    expect(ws.url).toBe("ws://127.0.0.1:4100/v1?token=s3cr%2Ft%2B");
    ws.open();
    await expect.poll(() => ws.sent).toEqual([{ id: 1, method: "project.setupStatus", params: { dir: "/p" } }]);
    ws.answer({ id: 1, ok: true, result: { state: "ready" } });
    expect(await call).toEqual({ state: "ready" });
  });

  it("matches answers to calls by id, in any order, over one socket", async () => {
    const { client, socket, sockets } = setup();
    const first = client.call("project.setupStatus", { dir: "/a" });
    const ws = await socket();
    ws.open();
    const second = client.call("project.init", { dir: "/b" });
    await expect.poll(() => ws.sent.length).toBe(2);
    ws.answer("not json");
    ws.answer({ id: 99, ok: true, result: "stray" });
    ws.answer({ id: 2, ok: false, error: "Not an open project." });
    ws.answer({ id: 1, ok: true, result: { state: "no-git" } });
    await expect(second).rejects.toThrow("Not an open project.");
    expect(await first).toEqual({ state: "no-git" });
    expect(sockets).toHaveLength(1);
  });

  it("fails when the host has no server, and asks again on the next call", async () => {
    const { client, socket, asked } = setup([null, ENDPOINT]);
    await expect(client.call("project.setupStatus", { dir: "/p" })).rejects.toThrow(SERVER_UNAVAILABLE);
    const retry = client.call("project.setupStatus", { dir: "/p" });
    const ws = await socket();
    ws.open();
    await expect.poll(() => ws.sent.length).toBe(1);
    // The failed call never reached a socket, so the retry is the first request sent.
    expect(ws.sent[0]?.id).toBe(1);
    ws.answer({ id: 1, ok: true, result: { state: "ready" } });
    expect(await retry).toEqual({ state: "ready" });
    expect(asked()).toBe(2);
  });

  it("fails when the socket can't connect", async () => {
    const { client, socket } = setup();
    const call = client.call("project.setupStatus", { dir: "/p" });
    (await socket()).emit("error", {});
    await expect(call).rejects.toThrow(SERVER_UNAVAILABLE);
  });

  it("fails pending calls when the connection drops, then reconnects to the restarted server", async () => {
    const restarted = { url: "ws://127.0.0.1:4200/v1", token: "new" };
    const { client, sockets, socket } = setup([ENDPOINT, restarted]);
    const pending = client.call("project.gitInit", { dir: "/p" });
    const old = await socket();
    old.open();
    await expect.poll(() => old.sent.length).toBe(1);
    old.emit("close", {});
    await expect(pending).rejects.toThrow(SERVER_LOST);

    const next = client.call("project.setupStatus", { dir: "/p" });
    await expect.poll(() => sockets.length).toBe(2);
    const ws = sockets[1] as FakeSocket;
    expect(ws.url).toBe("ws://127.0.0.1:4200/v1?token=new");
    ws.open();
    await expect.poll(() => ws.sent.length).toBe(1);
    ws.answer({ id: 2, ok: true, result: { state: "no-featra" } });
    expect(await next).toEqual({ state: "no-featra" });
  });

  it("close() closes the socket and fails what is pending", async () => {
    const { client, socket } = setup();
    const pending = client.call("project.setupStatus", { dir: "/p" });
    const ws = await socket();
    ws.open();
    await expect.poll(() => ws.sent.length).toBe(1);
    client.close();
    await expect(pending).rejects.toThrow(SERVER_LOST);
    await expect.poll(() => ws.closed).toBe(true);
  });
});

describe("the bridge's setup methods over the client", () => {
  it("turn transport failures into results the offer can show", async () => {
    const { client } = setup([null]);
    const setupBridge = serverSetup(client);
    expect(await setupBridge.status("/p")).toEqual({ state: "error", error: SERVER_UNAVAILABLE });
    expect(await setupBridge.plan("/p")).toEqual({ ok: false, error: SERVER_UNAVAILABLE });
    expect(await setupBridge.run("/p", ["context"])).toEqual({ ok: false, error: SERVER_UNAVAILABLE });
  });
});

describe("the endpoint the host hands out", () => {
  it("needs a ws URL and a token", () => {
    expect(normalizeEndpoint(ENDPOINT)).toEqual(ENDPOINT);
    expect(normalizeEndpoint({ ...ENDPOINT, extra: 1 })).toEqual(ENDPOINT);
    for (const raw of [null, {}, { ...ENDPOINT, token: "" }, { ...ENDPOINT, url: "http://127.0.0.1/v1" }]) {
      expect(normalizeEndpoint(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});
