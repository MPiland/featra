/**
 * STORY-12 (the MCP side): `request_merge` through the real Featra MCP process over stdio, into the real Featra services
 * (agent bridge, merge request, approval desk, story runner, worktrees, chat manager) on a real git repository with a
 * started feature. Only the platform is faked: the Agent SDK (a `query` that ends each turn at once) and the clock.
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newCard, parseCard, recordEvidence, serializeCard, setStatus } from "@featra/work-format";
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

/** The Agent SDK's `query`, faked: each message a session hears ends a turn at once, so its session is idle. */
const claude: ClaudeDeps = {
  locate: async () => "/usr/local/bin/claude",
  env: {},
  loadQuery: async () =>
    (({ prompt }: { prompt: AsyncIterable<unknown> }) => {
      const turns: unknown[] = [];
      const waiter = { wake: () => {} };
      void (async () => {
        for await (const m of prompt) {
          void m;
          turns.push({
            type: "result",
            subtype: "success",
            is_error: false,
            result: "Done.",
            parent_tool_use_id: null,
          });
          waiter.wake();
        }
      })();
      const stream = {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            while (turns.length === 0) await new Promise<void>((resolve) => (waiter.wake = resolve));
            return { done: false as const, value: turns.shift() };
          },
        }),
      };
      return Object.assign(stream, { interrupt: async () => {} });
    }) as never,
};

let root = "";
let project = "";
let server: RunningServer;
let services: ReturnType<typeof createServices>;
let lead = "";
let nine = "";
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

async function agent(id: string): Promise<Client> {
  const spec = await services.agents.attach({ id, dir: project });
  if (!spec) throw new Error("The bridge offered no MCP.");
  const client = new Client({ name: "agent", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ ...spec, stderr: "pipe" }));
  clients.push(client);
  return client;
}
const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]?.text ?? "";
const isError = (r: unknown) => (r as { isError?: boolean }).isError === true;
const message = (client: Client, args: Record<string, unknown>) =>
  client.callTool({ name: "request_merge", arguments: args });
const refused = async (client: Client, args: Record<string, unknown>) => {
  const r = await message(client, args);
  expect(isError(r)).toBe(true);
  return text(r);
};
const idle = async (id: string) => {
  const end = Date.now() + 10_000;
  for (;;) {
    const listed = (await call("chat.list", { dir: project })) as { chats: { id: string; running?: boolean }[] };
    if (listed.chats.find((c) => c.id === id)?.running === false) return;
    if (Date.now() > end) throw new Error("The session did not go idle.");
    await new Promise((r) => setTimeout(r, 20));
  }
};

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "featra-mcp-merge-")));
  project = join(root, "project");
  await mkdir(join(project, ".featra", "cards"), { recursive: true });
  git(project, "init", "-q", "-b", "main");
  git(project, "config", "core.autocrlf", "false");
  git(project, "config", "user.name", "Test");
  git(project, "config", "user.email", "test@example.invalid");
  git(project, "config", "commit.gpgsign", "false");
  await writeFile(join(project, ".featra", "config.yaml"), "version: 1\nmaxStoryAgents: 2\n");
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
  const leadClient = await agent(lead);
  const started = await leadClient.callTool({ name: "spawn_session", arguments: { story: "STORY-9" } });
  if (isError(started)) throw new Error(`Spawn refused: ${text(started)}`);
  const listed = (await call("chat.list", { dir: project })) as { chats: { id: string; story?: { id: string } }[] };
  nine = listed.chats.find((c) => c.story?.id === "STORY-9")?.id ?? "";
  if (nine === "") throw new Error("No story session for STORY-9.");
  await idle(nine);
}, 60_000);

afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
  await server.close();
  await services.close();
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

/** STORY-9 in review and Verified in its worktree, as its checks passing would leave it. */
async function verifyNine() {
  const trees = git(project, "worktree", "list", "--porcelain")
    .split(/\r?\n/)
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice("worktree ".length));
  const tree = trees.find((p) => p.includes("STORY-9"));
  if (!tree) throw new Error(`STORY-9 has no worktree: ${trees.join(", ")}`);
  const file = join(tree, ".featra", "cards", "STORY-9-card.md");
  const at = NOW.toISOString();
  const card = setStatus(parseCard(await readFile(file, "utf8")), "In Review", "session:test", at);
  await writeFile(file, serializeCard(recordEvidence(card, "verified", "system", at)));
}

describe("request_merge through the Featra MCP", () => {
  it("is listed with a description that teaches when to use it and when it is refused", async () => {
    const { tools } = await (await agent(lead)).listTools();
    const tool = tools.find((t) => t.name === "request_merge");
    expect(tool?.description).toBe(TOOLS.find((t) => t.name === "request_merge")?.description);
    expect(tool?.inputSchema.required).toEqual(["story"]);
    for (const taught of ["Verified", "approves or declines", "merge commit", "notice", "conflicts"]) {
      expect(tool?.description).toContain(taught);
    }
  });

  it("tells the agent why in one sentence when it is refused", async () => {
    const dev = await agent(lead);
    expect(await refused(dev, { story: "STORY-9" })).toBe(
      "Not asked. STORY-9 is In Progress. A story merges from review on.",
    );
    expect(await refused(dev, { story: "STORY-10" })).toBe("Not asked. STORY-10 has no worktree to merge.");
    expect(await refused(dev, { story: "FEAT-1" })).toBe(
      "Not asked. Give the story's id, such as STORY-9, as `story`.",
    );
    expect(await refused(await agent(nine), { story: "STORY-9" })).toBe(
      "Not asked. A story session can't ask to merge. Ask the Dev Lead.",
    );
  });

  it("asks the user in the Dev Lead's chat and answers at once", async () => {
    await verifyNine();
    const stranger = ((await call("chat.start", { dir: project, role: "dev-lead" })) as { id: string }).id;
    expect(await refused(await agent(stranger), { story: "STORY-9" })).toBe(
      "Not asked. Only the Dev Lead that started STORY-9 can ask to merge it.",
    );
    const result = await message(await agent(lead), { story: "STORY-9" });
    expect(isError(result)).toBe(false);
    expect(text(result)).toBe(
      "Asked the user to merge STORY-9. A notice tells you when they approve or decline it, and how the merge went.",
    );
    expect(await refused(await agent(lead), { story: "STORY-9" })).toBe(
      "Not asked. A merge of STORY-9 is already waiting for the user.",
    );
  });
});
