import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServerProcess, startAfter, type ServerProcess } from "../src/server-process.ts";

/**
 * STORY-64: the window opens while the login shell's PATH is read; the real server, forked from its source, starts only
 * once it has been, so it and its agents run with that PATH.
 */
const SERVER_SOURCE = join(import.meta.dirname, "..", "..", "..", "packages", "server", "src", "main.ts");

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const pending = Symbol("pending");
/** What `promise` resolved with within `ms`, or `pending`. */
const within = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<typeof pending>((r) => setTimeout(() => r(pending), ms))]);

let servers: ServerProcess[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => s.stop()));
  servers = [];
});

function gatedServer() {
  const logged: string[] = [];
  const ready = deferred();
  const server = startAfter(
    ready.promise,
    createServerProcess({ script: SERVER_SOURCE, execPath: process.execPath, log: (m) => logged.push(m) }),
  );
  servers.push(server);
  return { server, ready, logged };
}

describe("the server started after the PATH is read (STORY-64)", () => {
  it("doesn't start until it is told to, then starts with what main set meanwhile", async () => {
    const { server, ready, logged } = gatedServer();
    const endpoint = server.endpoint();
    const projects = server.setProjects([]);
    expect(await within(endpoint, 1000)).toBe(pending);
    expect(logged).toEqual([]);
    ready.resolve();
    expect((await endpoint)?.url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/v1$/);
    await projects;
    expect(logged.some((l) => l.startsWith("Server listening on"))).toBe(true);
  });

  it("starts nothing when the app quits before then, and starts on the next use after", async () => {
    const { server, ready, logged } = gatedServer();
    const endpoint = server.endpoint();
    await server.stop();
    ready.resolve();
    expect(await endpoint).toBeNull();
    expect(logged).toEqual([]);
    expect(await server.endpoint()).not.toBeNull();
  });
});
