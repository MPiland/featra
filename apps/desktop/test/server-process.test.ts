import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServerClient, serverSetup, type ServerEndpoint } from "@featra/client/bridge";
import { createServerProcess, type ServerProcess } from "../src/server-process.ts";

/**
 * The server's process model end to end, below the window: main's real ServerProcess forks the real server, and the
 * preload's real client and setup calls talk to it over a real WebSocket, against real git in temporary folders.
 * Only the runtime differs: Node runs the server's TypeScript source here, Electron's Node runs the bundle in the app.
 */
const SERVER_SOURCE = join(import.meta.dirname, "..", "..", "..", "packages", "server", "src", "main.ts");

function gitEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return env;
}

const folders: string[] = [];
async function folder(git = false) {
  const dir = await mkdtemp(join(tmpdir(), "featra-host-"));
  if (git) execFileSync("git", ["init", "-q"], { cwd: dir, env: gitEnv() });
  folders.push(dir);
  return dir;
}
afterAll(() => Promise.all(folders.map((d) => rm(d, { recursive: true, force: true, maxRetries: 20 }))));

let server: ServerProcess;
const logged: string[] = [];
beforeAll(() => {
  server = createServerProcess({ script: SERVER_SOURCE, execPath: process.execPath, log: (m) => logged.push(m) });
});
afterAll(() => server.stop());

const clients: { close: () => void }[] = [];
afterEach(() => clients.splice(0).forEach((c) => c.close()));
function client(endpoint: () => Promise<ServerEndpoint | null> = () => server.endpoint()) {
  const c = createServerClient(endpoint, (url) => new WebSocket(url));
  clients.push(c);
  return c;
}

describe("the server child process", () => {
  it("listens on 127.0.0.1 with a fresh token", async () => {
    const endpoint = await server.endpoint();
    expect(endpoint?.url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/v1$/);
    expect(endpoint?.token.length).toBeGreaterThanOrEqual(40);
    expect(logged.some((l) => l.startsWith("Server listening on 127.0.0.1:"))).toBe(true);
    expect(logged.join("\n")).not.toContain(endpoint?.token);
  }, 20_000);

  it("takes a plain folder through git init and Featra init, through the client the preload uses", async () => {
    const dir = await folder();
    await server.setProjects([dir]);
    const setup = serverSetup(client());
    expect(await setup.status(dir)).toEqual({ state: "no-git" });
    expect(await setup.initGit(dir)).toEqual({ state: "no-featra" });
    const result = await setup.initFeatra(dir);
    expect(result).toMatchObject({ ok: true, kept: [] });
    expect(await readFile(join(dir, ".featra", "config.yaml"), "utf8")).toContain("version: 1");
    expect(await setup.status(dir)).toEqual({ state: "ready" });
  }, 20_000);

  it("acts only on folders main listed, and the newest list wins", async () => {
    const first = await folder(true);
    const second = await folder(true);
    await server.setProjects([first]);
    const setup = serverSetup(client());
    expect(await setup.status(second)).toEqual({ state: "error", error: "Not an open project." });
    expect(await setup.initFeatra(second)).toEqual({ ok: false, error: "Not an open project." });
    await server.setProjects([first, second]);
    expect(await setup.status(second)).toEqual({ state: "no-featra" });
  }, 20_000);

  it("refuses a client with an old token, and a stopped server comes back on next use", async () => {
    const dir = await folder(true);
    await server.setProjects([dir]);
    const before = await server.endpoint();
    const live = client();
    expect(await serverSetup(live).status(dir)).toEqual({ state: "no-featra" });
    server.stop();

    const after = await server.endpoint();
    expect(after?.token).not.toBe(before?.token);
    // The same client reconnects to the new server, which still has the project list; the old token is refused.
    await expect.poll(() => serverSetup(live).status(dir), { timeout: 10_000 }).toEqual({ state: "no-featra" });
    const stale = serverSetup(client(async () => (after && before ? { url: after.url, token: before.token } : null)));
    expect((await stale.status(dir)).state).toBe("error");
  }, 30_000);
});
