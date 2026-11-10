/**
 * STORY-52 AC2: `start_feature` through the real Featra MCP process over stdio, into a real Featra server (its WebSocket,
 * agent bridge, scanner and feature start) and a real git repository. Only the platform is faked: the chat list the
 * server asks about, the clock, and the agent (the test is the MCP host, as an agent's SDK would be).
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { newCard, parseCard, serializeCard, setStatus } from "@featra/work-format";
import {
  createAgentBridge,
  createAllowedProjects,
  createFeatureStart,
  createLogWriter,
  createRepoGit,
  createScanner,
  createServices,
  startServer,
  type AgentBridge,
  type RunningServer,
} from "@featra/server";
import { TOOLS } from "../src/index.ts";

const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const CHAT = "chat-1";

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

let root = "";
let project = "";
let server: RunningServer;
let bridge: AgentBridge;
let services: ReturnType<typeof createServices>;
let scanner: ReturnType<typeof createScanner>;
const settings = { enabled: true };
const clients: Client[] = [];

const feature = (id: string, title: string, status: string) => {
  const made = newCard({ id, type: "feature", title, status: "draft", parent: null }, "user", "2026-11-10T08:00:00Z");
  return status === "draft" ? made : setStatus(made, status, "user", "2026-11-10T08:30:00Z");
};

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "featra-mcp-start-")));
  project = join(root, "project");
  await mkdir(join(project, ".featra", "cards"), { recursive: true });
  git(project, "init", "-q", "-b", "main");
  git(project, "config", "core.autocrlf", "false");
  await writeFile(join(project, ".featra", "config.yaml"), "version: 1\n");
  for (const c of [feature("FEAT-1", "Delegation", "approved"), feature("FEAT-2", "Not yet", "draft")]) {
    await writeFile(join(project, ".featra", "cards", `${c.id}-card.md`), serializeCard(c));
  }
  git(project, "add", "-A");
  git(project, "commit", "-q", "-m", "plan");

  scanner = createScanner(createRepoGit());
  bridge = createAgentBridge({
    entry: MAIN,
    enabled: () => Promise.resolve(settings.enabled),
    chats: {
      info: (id) => (id === CHAT ? { dir: project, session: "Dev Lead chat 1a2b3c4d" } : null),
      report: () => {},
      retitle: () => {},
    },
    writer: createLogWriter({
      fs: { read: async () => null, write: async () => {} },
      now: () => new Date("2026-11-10T09:00:00Z"),
    }),
    starts: createFeatureStart({ scan: scanner.scan, now: () => new Date("2026-11-10T09:00:00Z") }),
  });
  services = createServices({ allowed: createAllowedProjects(), log: () => {} });
  server = await startServer({ token: "window-token-0123456789", api: services.api, agents: bridge, log: () => {} });
  bridge.setPort(server.port);
});

afterEach(async () => {
  settings.enabled = true;
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

afterAll(async () => {
  await server.close();
  await services.close();
  await scanner.close();
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

async function agent(): Promise<Client> {
  const spec = await bridge.attach({ id: CHAT, dir: project });
  if (!spec) throw new Error("The bridge offered no MCP.");
  const client = new Client({ name: "agent", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ ...spec, stderr: "pipe" }));
  clients.push(client);
  return client;
}

const text = (result: unknown) => (result as { content: { text: string }[] }).content[0]?.text ?? "";
const isError = (result: unknown) => (result as { isError?: boolean }).isError === true;
const call = (client: Client, id: unknown) => client.callTool({ name: "start_feature", arguments: { feature: id } });

describe("AC2: start_feature through the Featra MCP", () => {
  it("is listed with its own description, which says when to use it", async () => {
    const { tools } = await (await agent()).listTools();
    const tool = tools.find((t) => t.name === "start_feature");
    expect(tool?.description).toBe(TOOLS.find((t) => t.name === "start_feature")?.description);
    expect(tool?.description?.toLowerCase()).toContain("approved");
    expect(tool?.inputSchema.required).toEqual(["feature"]);
  });

  it("refuses what it can't start, telling the agent why, and changes nothing", async () => {
    const client = await agent();
    const head = git(project, "rev-parse", "main");
    const draft = await call(client, "FEAT-2");
    expect(isError(draft)).toBe(true);
    expect(text(draft)).toBe("Not started. FEAT-2 isn't approved yet. Approve it first.");
    const malformed = await call(client, "soon");
    expect(isError(malformed)).toBe(true);
    expect(text(malformed)).toBe("Not started. Give the feature's id, such as FEAT-5, as `feature`.");
    settings.enabled = false;
    const off = await call(client, "FEAT-1");
    expect(isError(off)).toBe(true);
    expect(text(off)).toBe("Not started. Featra MCP is off for this project.");
    expect(git(project, "branch", "--format=%(refname:short)")).toBe("main");
    expect(git(project, "rev-parse", "main")).toBe(head);
  });

  it("starts the approved feature as the chat's session, and a second call is refused", async () => {
    const client = await agent();
    const started = await call(client, "FEAT-1");
    expect(isError(started)).toBe(false);
    expect(text(started)).toBe("Started FEAT-1 on feature/1-delegation. Not pushed.");
    const onBranch = parseCard(git(project, "show", "feature/1-delegation:.featra/cards/FEAT-1-card.md"));
    expect(onBranch.status).toBe("active");
    expect(onBranch.history.at(-1)).toMatchObject({
      field: "status",
      from: "approved",
      to: "active",
      by: "session:chat-1",
    });
    expect(git(project, "symbolic-ref", "HEAD")).toBe("refs/heads/main");
    const again = await call(client, "FEAT-1");
    expect(isError(again)).toBe(true);
    expect(text(again)).toBe("Not started. FEAT-1 is already active.");
  });
});
