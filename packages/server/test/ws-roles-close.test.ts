/** STORY-6 AC1 over the real socket and services: closing the project ends its role watchers, with the socket still open. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { roleWorld } from "./role-world.ts";
import { watchSpy } from "./watch-spy.ts";
import { openFrames } from "./ws-frames.ts";

const TOKEN = "test-token-0123456789";
const allowed = createAllowedProjects();
const spy = watchSpy();
let world: Awaited<ReturnType<typeof roleWorld>>;
let services: ReturnType<typeof createServices>;
let server: RunningServer;

beforeAll(async () => {
  world = await roleWorld();
  services = createServices({ allowed, log: () => {}, roleFs: world.fs, roleWatchFolder: spy.watchFolder });
  allowed.set([world.dir]);
  server = await startServer({ token: TOKEN, api: services.api, log: () => {} });
});

afterAll(async () => {
  await server.close();
  await services.close();
  await world.dispose();
});

describe("a closed project holds no role watcher", () => {
  it("ends them when the project is closed, not only when the socket closes", async () => {
    const socket = await openFrames<unknown>(`${server.url}?token=${TOKEN}`);
    try {
      socket.send({ id: 1, method: "roles.watch", params: { dir: world.dir } });
      await socket.next((f) => f.id === 1);
      expect(spy.open.size).toBeGreaterThan(0);
      allowed.set([]);
      expect(spy.open.size).toBe(0);
    } finally {
      socket.close();
    }
  });
});
