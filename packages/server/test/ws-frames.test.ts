import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { openWaits } from "@featra/tooling/waits";
import { openFrames } from "./ws-frames.ts";

/** BUG-30: a frame a test waits for is noted, so a test the hang guard stops names the frame it never got. */
const servers: WebSocketServer[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function listening(): Promise<{ url: string; send: (frame: object) => void }> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  servers.push(server);
  await new Promise((r) => server.once("listening", r));
  const joined = new Promise<(frame: object) => void>((r) =>
    server.once("connection", (ws) => r((f) => ws.send(JSON.stringify(f)))),
  );
  const { port } = server.address() as { port: number };
  return { url: `ws://127.0.0.1:${port}`, send: (f) => void joined.then((send) => send(f)) };
}

describe("waiting for a frame (BUG-30)", () => {
  it("is noted at the test line with what it matches, until the frame comes", async () => {
    const server = await listening();
    const socket = await openFrames(server.url);
    const pushed = socket.next((f) => f.event === "work.list");
    expect(openWaits()).toMatch(
      /- a frame matching \(f\) => f\.event === "work\.list" \(for 0 s\)\n {4}at packages\/server\/test\/ws-frames\.test\.ts:\d+: const pushed = socket\.next/,
    );
    server.send({ event: "work.list" });
    expect((await pushed).event).toBe("work.list");
    expect(openWaits()).toBeUndefined();
    socket.close();
  });
});
