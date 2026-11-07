import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { tempFolder } from "./temp-folder.ts";
import { connect, request } from "./ws-client.ts";

/** The real server on a free loopback port, real git, a temporary repository; Node's WebSocket as the client. */
const TOKEN = "test-token-0123456789";
const allowed = createAllowedProjects();
const logged: string[] = [];
let server: RunningServer;
const services = createServices({ allowed, log: (m) => logged.push(m) });
let repo: Awaited<ReturnType<typeof tempFolder>>;

beforeAll(async () => {
  repo = await tempFolder({ git: true });
  allowed.set([repo.dir]);
  server = await startServer({
    token: TOKEN,
    api: services.api,
    log: (m) => logged.push(m),
  });
});
afterAll(async () => {
  await server.close();
  await services.close();
  await repo.dispose();
});

const withToken = (token: string, url = server.url) => `${url}?token=${encodeURIComponent(token)}`;

describe("the WebSocket API", () => {
  it("listens on 127.0.0.1 only, at /v1", () => {
    expect(server.url).toBe(`ws://127.0.0.1:${server.port}/v1`);
  });

  it("refuses a connection without the token, with a wrong one, or on another path", async () => {
    await expect(connect(server.url)).rejects.toThrow("Can't connect");
    await expect(connect(withToken("wrong-token-0123456789"))).rejects.toThrow("Can't connect");
    await expect(connect(withToken(TOKEN, server.url.replace("/v1", "/v2")))).rejects.toThrow("Can't connect");
  });

  it("answers a request with its id and the method's result", async () => {
    const socket = await connect(withToken(TOKEN));
    try {
      expect(await socket.ask(request(7, "project.setupStatus", { dir: repo.dir }))).toEqual({
        id: 7,
        ok: true,
        result: { state: "no-featra" },
      });
      const init = await socket.ask(request(8, "project.init", { dir: repo.dir }));
      expect(init).toMatchObject({ id: 8, ok: true, result: { ok: true, kept: [] } });
      expect(await readFile(join(repo.dir, ".featra", "config.yaml"), "utf8")).toContain("version: 1");
      expect(await socket.ask(request(9, "project.setupStatus", { dir: repo.dir }))).toEqual({
        id: 9,
        ok: true,
        result: { state: "ready" },
      });
    } finally {
      socket.close();
    }
  });

  it("refuses a folder that is not an open project, and bad params, without logging them", async () => {
    const socket = await connect(withToken(TOKEN));
    try {
      const other = await tempFolder({ git: true });
      try {
        expect(await socket.ask(request(1, "project.init", { dir: other.dir }))).toEqual({
          id: 1,
          ok: false,
          error: "Not an open project.",
        });
      } finally {
        await other.dispose();
      }
      expect(await socket.ask(request(2, "project.init", { folder: repo.dir }))).toEqual({
        id: 2,
        ok: false,
        error: "Expected { dir }.",
      });
      expect(logged).toEqual([]);
    } finally {
      socket.close();
    }
  });

  it("answers an unknown method and ignores a frame without an id", async () => {
    const socket = await connect(withToken(TOKEN));
    try {
      socket.send("not json"); // no answer comes: there is no id to answer to
      expect(await socket.ask(request(3, "cards.delete", {}))).toEqual({ id: 3, ok: false, error: "Unknown method." });
    } finally {
      socket.close();
    }
  });

  it("won't start without a token", async () => {
    await expect(startServer({ token: "", api: async () => ({ state: "ready" }), log: () => {} })).rejects.toThrow(
      "The server needs a token.",
    );
  });
});
