/**
 * The server when its desktop host goes (host-gone.ts): the app is quitting. Real dev servers (dev-servers.ts) and real
 * host capture; only the dev server's process and the sockets' close are faked.
 */
import { describe, expect, it } from "vitest";
import type { RunControl, RunResult } from "../src/check-run.ts";
import { createDevServers } from "../src/dev-servers.ts";
import { createHostCapture } from "../src/host-capture.ts";
import { whenHostGone } from "../src/host-gone.ts";

const noop = () => {};

/** A dev server's process that runs until it is cancelled. */
function devServerProcess() {
  const proc = { cancelled: 0 };
  let exit: () => void = noop;
  const done = new Promise<RunResult>((resolve) => {
    exit = () => resolve({ code: null, output: "", timedOut: false });
  });
  const control: RunControl = {
    cancel: () => {
      proc.cancelled++;
      exit();
    },
    done,
    output: () => "",
  };
  return { proc, control };
}

describe("the host going", () => {
  // Regression (STORY-25, Windows close hang): the dev servers were stopped only after the sockets and services had
  // closed. On Windows the app's quit ends the server process by then, which ends the dev server's shell but not the
  // server under it: it kept running, and the app never finished closing.
  it("stops the dev servers Featra started first, before the sockets and services close", async () => {
    const { proc, control } = devServerProcess();
    let spawned = false;
    // It answers once started: nothing answers on its port before.
    const devServers = createDevServers({
      run: () => {
        spawned = true;
        return control;
      },
      answers: async () => spawned,
      portFree: async () => true,
    });
    const started = await devServers.start("/p", "STORY-1", "/p/tree", "serve {port}", "http://localhost:5173");
    expect(started).toEqual({ ok: true, url: "http://localhost:5173" });
    const sent: unknown[] = [];
    const capture = createHostCapture((message) => sent.push(message));
    const asked = capture.capture("http://localhost:5173/", "http://localhost:5173");
    let closed: () => void = noop;
    const closing = new Promise<void>((resolve) => {
      closed = resolve;
    });
    let exited = 0;

    const gone = whenHostGone({ capture, devServers, close: () => closing, exit: () => exited++ });

    expect(proc.cancelled).toBe(1);
    expect(devServers.running("/p", "STORY-1")).toBe(false);
    expect(await asked).toEqual({ ok: false, error: "Featra can't capture pages here." });
    expect(exited).toBe(0);
    closed();
    await gone;
    expect(exited).toBe(1);
    expect(proc.cancelled).toBe(1);
  });
});
