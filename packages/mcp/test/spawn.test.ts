/**
 * STORY-9 AC7 (the MCP side): `spawn_session` through the real Featra MCP process over stdio, into the real Featra
 * services (agent bridge, WebSocket server, story runner, worktrees, chat manager) on a real git repository with a started
 * feature. Only the platform is faked: the Agent SDK (a recording `query`) and the clock; the test is the Dev Lead's host.
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newCard, parseCard, serializeCard, setStatus } from "@featra/work-format";
import {
  createAllowedProjects,
  createServices,
  startServer,
  type Api,
  type ClaudeDeps,
  type RunningServer,
} from "@featra/server";
import { TOOLS } from "../src/index.ts";

const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const NOW = new Date("2026-11-10T09:00:00Z");

const gitEnv = (() => {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return {
    ...env,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
})();
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env: gitEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** The Agent SDK's `query`, faked: it records each session's options and the messages it is fed, and never answers. */
const runs: { options: Record<string, unknown>; heard: string[] }[] = [];
const claude: ClaudeDeps = {
  locate: async () => "/usr/local/bin/claude",
  env: {},
  loadQuery: async () =>
    (({
      prompt,
      options,
    }: {
      prompt: AsyncIterable<{ message: { content: unknown } }>;
      options: Record<string, unknown>;
    }) => {
      const run = { options, heard: [] as string[] };
      runs.push(run);
      let done!: () => void;
      const over = new Promise<void>((resolve) => (done = resolve));
      void (async () => {
        for await (const m of prompt) {
          const c = m.message.content;
          run.heard.push(typeof c === "string" ? c : JSON.stringify(c));
        }
        done();
      })();
      const stream = {
        [Symbol.asyncIterator]: () => ({ next: () => over.then(() => ({ done: true as const, value: undefined })) }),
      };
      return Object.assign(stream, { interrupt: async () => {} });
    }) as never,
};

let root = "";
let project = "";
let server: RunningServer;
let services: ReturnType<typeof createServices>;
let lead = "";
const clients: Client[] = [];
const connection = { push: () => {}, keep: () => {}, unwatch: () => false };
const call = (method: Parameters<Api>[0], params: unknown) => services.api(method, params, 1, connection);

const story = (n: number, title: string) => ({
  ...newCard(
    { id: `STORY-${n}`, type: "story", title, status: "New", parent: "FEAT-1" },
    "user",
    "2026-11-10T08:00:00Z",
  ),
  description: `Do ${title}.`,
});

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "featra-mcp-spawn-")));
  project = join(root, "project");
  await mkdir(join(project, ".featra", "cards"), { recursive: true });
  git(project, "init", "-q", "-b", "main");
  git(project, "config", "core.autocrlf", "false");
  git(project, "config", "user.name", "Test");
  git(project, "config", "user.email", "test@example.invalid");
  git(project, "config", "commit.gpgsign", "false");
  // One session at a time, so a second spawn waits Queued.
  await writeFile(join(project, ".featra", "config.yaml"), "version: 1\nmaxStoryAgents: 1\n");
  const feature = setStatus(
    newCard(
      { id: "FEAT-1", type: "feature", title: "Delegation", status: "draft", parent: null },
      "user",
      "2026-11-10T08:00:00Z",
    ),
    "approved",
    "user",
    "2026-11-10T08:30:00Z",
  );
  for (const c of [feature, story(9, "Spawn nine"), story(10, "Spawn ten")]) {
    await writeFile(join(project, ".featra", "cards", `${c.id}-card.md`), serializeCard(c));
  }
  git(project, "add", "-A");
  git(project, "commit", "-q", "-m", "plan");

  const allowed = createAllowedProjects();
  allowed.set([project]);
  services = createServices({ allowed, log: () => {}, now: () => NOW, claude, mcpEntry: MAIN });
  server = await startServer({
    token: "window-token-0123456789",
    api: services.api,
    agents: services.agents,
    log: () => {},
  });
  services.agents.setPort(server.port);
  await call("feature.start", { dir: project, id: "FEAT-1" });
  lead = ((await call("chat.start", { dir: project, role: "dev-lead" })) as { id: string }).id;
}, 60_000);

afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
  await server.close();
  await services.close();
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

async function agent(): Promise<Client> {
  const spec = await services.agents.attach({ id: lead, dir: project });
  if (!spec) throw new Error("The bridge offered no MCP.");
  const client = new Client({ name: "agent", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ ...spec, stderr: "pipe" }));
  clients.push(client);
  return client;
}
const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]?.text ?? "";
const isError = (r: unknown) => (r as { isError?: boolean }).isError === true;
const spawn = (client: Client, args: Record<string, unknown>) =>
  client.callTool({ name: "spawn_session", arguments: args });

describe("spawn_session through the Featra MCP", () => {
  it("is listed with its own description and requires only the story", async () => {
    const { tools } = await (await agent()).listTools();
    const tool = tools.find((t) => t.name === "spawn_session");
    expect(tool?.description).toBe(TOOLS.find((t) => t.name === "spawn_session")?.description);
    expect(tool?.inputSchema.required).toEqual(["story"]);
  });

  it("starts the story's session with the model, effort and brief it was given, and says it started", async () => {
    const result = await spawn(await agent(), {
      story: "story-9",
      model: "opus",
      effort: "high",
      brief: "Mind the paths.",
    });
    expect(isError(result)).toBe(false);
    expect(text(result)).toBe("Started STORY-9.");
    const worktree = join(project, ".claude", "worktrees", "STORY-9-spawn-nine");
    expect(parseCard(await readFile(join(worktree, ".featra", "cards", "STORY-9-card.md"), "utf8")).status).toBe(
      "In Progress",
    );
    const run = runs.find((r) => r.options.cwd === worktree);
    expect(run?.options).toMatchObject({ model: "opus", effort: "high" });
    await until(() => (run?.heard.length ?? 0) === 1);
    expect(run?.heard[0]).toContain("Mind the paths.");
  });

  it("says when the story was queued", async () => {
    const result = await spawn(await agent(), { story: "STORY-10" });
    expect(text(result)).toBe("Queued STORY-10. It starts when a story agent ends.");
  });

  it("tells the agent why in one sentence when it is refused", async () => {
    const client = await agent();
    const gone = await spawn(client, { story: "STORY-404" });
    expect(isError(gone)).toBe(true);
    expect(text(gone)).toMatch(/^Not started\. .+/);
    const bad = await spawn(client, { story: "soon" });
    expect(isError(bad)).toBe(true);
    expect(text(bad)).toBe("Not started. Give the story's id, such as STORY-9, as `story`.");
  });
});

async function until(ok: () => boolean, ms = 20_000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`Not seen in ${ms} ms`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
