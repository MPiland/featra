/**
 * STORY-25 (ADR 0044): the server's end of page capture. Each ask goes to the desktop host numbered, and settles with
 * the host's answer to that number; without a host, or once it is gone, nothing is captured. The host's IPC channel is
 * the platform here: a function that records what is sent.
 */
import { describe, expect, it } from "vitest";
import { createHostCapture, NO_HOST } from "../src/host-capture.ts";
import type { ServerMessage } from "../src/host-messages.ts";

describe("capturing through the desktop host", () => {
  it("numbers each ask and settles it with the host's answer to that number", async () => {
    const sent: ServerMessage[] = [];
    const host = createHostCapture((m) => sent.push(m));
    const first = host.capture("http://localhost:5173/a");
    const second = host.capture("http://localhost:5173/b");
    expect(sent).toEqual([
      { type: "capture", seq: 1, url: "http://localhost:5173/a" },
      { type: "capture", seq: 2, url: "http://localhost:5173/b" },
    ]);
    host.settle({ type: "captured", seq: 2, error: "The page took too long to load." });
    host.settle({ type: "captured", seq: 1, data: Buffer.from("page").toString("base64"), ext: "jpg" });
    host.settle({ type: "captured", seq: 9, error: "an answer to nothing asked" });
    expect(await first).toEqual({ ok: true, data: Buffer.from("page"), ext: "jpg" });
    expect(await second).toEqual({ ok: false, error: "The page took too long to load." });
  });

  it("captures nothing without a host", async () => {
    expect(await createHostCapture(null).capture("http://localhost:5173")).toEqual({ ok: false, error: NO_HOST });
  });

  it("ends every ask uncaptured when the host goes", async () => {
    const host = createHostCapture(() => {});
    const asked = host.capture("http://localhost:5173");
    host.close();
    expect(await asked).toEqual({ ok: false, error: NO_HOST });
  });
});
