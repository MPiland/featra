import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createServerProcess } from "../src/server-process.ts";

/**
 * Main stopping the server child as the app quits (ADR 0015): the quit waits for the child to exit, so the server can
 * stop what it started first (STORY-25), but never forever. A real child process; it runs deaf-server.mjs, a server
 * that ignores the stop.
 */
const DEAF = join(import.meta.dirname, "deaf-server.mjs");

describe("stopping the server child", () => {
  // Regression (STORY-25, Windows close hang): the quit must not wait forever on a server that doesn't exit.
  it("ends a server that doesn't exit when told, so the quit waiting on it goes on", async () => {
    const logged: string[] = [];
    const server = createServerProcess({
      script: DEAF,
      execPath: process.execPath,
      log: (m) => logged.push(m),
      stopMs: 200,
    });
    expect(await server.endpoint()).not.toBeNull();
    await server.stop(); // resolves once the child has exited
    expect(logged.filter((l) => l.startsWith("Server stopped"))).toEqual([]);
  });
});
