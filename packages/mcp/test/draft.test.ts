/**
 * STORY-8: `draft_cards` through the real Featra MCP process over stdio, into a real Featra server (its WebSocket, agent
 * bridge, scanner and draft writer) and a real git repository. Only the platform is faked: the chat list the server
 * asks about, the clock, and the agent (the test is the MCP host, as an agent's SDK would be; a stand-in provider adapter
 * takes the place of a second provider).
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { parseCard, type ChatSettings } from "@featra/work-format";
import {
  createAgentBridge,
  createAllowedProjects,
  createChatManager,
  createDraftWriter,
  createLogWriter,
  createRepoGit,
  createRoleRegistry,
  createScanner,
  createServices,
  startServer,
  type AgentBridge,
  type ChatManager,
  type ProviderAdapter,
  type RunningServer,
  type SessionOptions,
} from "@featra/server";
import { TOOLS } from "../src/index.ts";

const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const WINDOW_TOKEN = "window-token-0123456789";
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

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "featra-mcp-draft-")));
  project = join(root, "project");
  await mkdir(join(project, ".featra", "cards"), { recursive: true });
  git(project, "init", "-q", "-b", "main");
  git(project, "config", "core.autocrlf", "false");
  await writeFile(join(project, ".featra", "config.yaml"), "version: 1\n");
  await writeFile(join(project, "README.md"), "demo\n");
  git(project, "add", "-A");
  git(project, "commit", "-q", "-m", "start");

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
    drafts: createDraftWriter({ scan: scanner.scan, now: () => new Date("2026-11-10T09:00:00Z") }),
  });
  services = createServices({ allowed: createAllowedProjects(), log: () => {} });
  server = await startServer({ token: WINDOW_TOKEN, api: services.api, agents: bridge, log: () => {} });
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

/** A host that starts the MCP the way Featra describes it to an agent: command, args and environment. */
async function host(spec: { command: string; args: string[]; env: Record<string, string> }): Promise<Client> {
  const client = new Client({ name: "agent", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ ...spec, stderr: "pipe" }));
  clients.push(client);
  return client;
}

async function agent(chat = CHAT) {
  const spec = await bridge.attach({ id: chat, dir: project });
  if (!spec) throw new Error("The bridge offered no MCP.");
  return host(spec);
}

const text = (result: unknown) => (result as { content: { text: string }[] }).content[0]?.text ?? "";
const isError = (result: unknown) => (result as { isError?: boolean }).isError === true;
const cardFiles = async () => (await readdir(join(project, ".featra", "cards"))).toSorted();
const readCard = async (name: string) => parseCard(await readFile(join(project, ".featra", "cards", name), "utf8"));

const story = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  story: `As a builder, I ${title.toLowerCase()}, so that it is clear.`,
  criteria: [`${title} works`],
  tasks: ["Build it"],
  ...extra,
});

describe("AC1 and AC4: draft_cards through the Featra MCP", () => {
  it("teaches the card format in its own description, with no prompt to inject", async () => {
    const { tools } = await (await agent()).listTools();
    const tool = tools.find((t) => t.name === "draft_cards");
    expect(tool?.description).toBe(TOOLS.find((t) => t.name === "draft_cards")?.description);
    const description = (tool?.description ?? "").toLowerCase();
    for (const cue of [
      "vertical slice",
      "as a <who>",
      "acceptance criteria",
      "tasks",
      "nothing is committed",
      "update",
    ]) {
      expect(description).toContain(cue);
    }
    expect(tool?.inputSchema.required).toEqual(["feature", "stories"]);
  });

  it("drafts a feature with its stories, tells the agent the IDs, and writes cards main owns, uncommitted (AC1, AC3)", async () => {
    const client = await agent();
    const head = git(project, "rev-parse", "HEAD");
    const first = await client.callTool({
      name: "draft_cards",
      arguments: {
        feature: { title: "Shaping", description: "Talk a feature through with the Dev Lead." },
        stories: [story("Draft a feature"), story("Review the draft")],
      },
    });
    expect(isError(first)).toBe(false);
    expect(text(first)).toBe(
      "Drafted FEAT-1 with STORY-1, STORY-2. Not committed: the user reviews the draft in Work.",
    );
    expect(await cardFiles()).toEqual([
      "FEAT-1-shaping.md",
      "STORY-1-draft-a-feature.md",
      "STORY-2-review-the-draft.md",
    ]);
    expect(git(project, "rev-parse", "HEAD")).toBe(head);
    expect(git(project, "status", "--porcelain", "--untracked-files=all").split("\n")).toHaveLength(3);
    const feature = await readCard("FEAT-1-shaping.md");
    expect(feature).toMatchObject({ status: "draft", extra: { "drafted-by": CHAT } });
    expect(await readCard("STORY-1-draft-a-feature.md")).toMatchObject({
      parent: "FEAT-1",
      acs: [{ text: "Draft a feature works" }],
      tasks: [{ text: "Build it" }],
    });

    // AC3: the same chat calls again, and the same cards are revised in place.
    const second = await client.callTool({
      name: "draft_cards",
      arguments: {
        feature: { title: "Shaping", description: "Talk a feature through with the Dev Lead." },
        stories: [
          story("Draft a feature", { id: "STORY-1", criteria: ["It works", "It is quick"] }),
          story("Send it back"),
        ],
      },
    });
    expect(text(second)).toBe(
      "Updated FEAT-1 in place with STORY-1, STORY-3. Left out and cancelled: STORY-2. Not committed: the user reviews the draft in Work.",
    );
    expect(await cardFiles()).toEqual([
      "FEAT-1-shaping.md",
      "STORY-1-draft-a-feature.md",
      "STORY-2-review-the-draft.md",
      "STORY-3-send-it-back.md",
    ]);
    const revised = await readCard("STORY-1-draft-a-feature.md");
    expect(revised.acs.map((a) => a.text)).toEqual(["It works", "It is quick"]);
    expect(revised.history.map((h) => [h.field, h.to, h.by])).toEqual([
      ["status", "New", "session:chat-1"],
      ["content", "criteria", "session:chat-1"],
    ]);
    expect((await readCard("STORY-2-review-the-draft.md")).status).toBe("Cancelled");
    expect((await readCard("FEAT-1-shaping.md")).history.at(-1)).toMatchObject({ field: "content", to: "stories" });
  });

  it("refuses a malformed draft with a clear error to the agent, and writes nothing", async () => {
    const client = await agent();
    const before = await cardFiles();
    const refused = await client.callTool({
      name: "draft_cards",
      arguments: {
        feature: { title: "No stories", description: "d" },
        stories: [{ title: "No criteria", story: "As a builder, I x." }],
      },
    });
    expect(isError(refused)).toBe(true);
    expect(text(refused)).toBe('Not drafted. stories[0]: "criteria" needs at least 1.');
    const wrongId = await client.callTool({
      name: "draft_cards",
      arguments: { feature: { title: "t", description: "d" }, stories: [story("Other", { id: "STORY-99" })] },
    });
    expect(isError(wrongId)).toBe(true);
    expect(text(wrongId)).toBe(`Not drafted. STORY-99 isn't a story of FEAT-1. Leave "id" out for a new story.`);
    expect(await cardFiles()).toEqual(before);
  });

  it("is refused in a project whose MCP is off, even for a chat that is already running", async () => {
    const client = await agent();
    settings.enabled = false;
    const before = await cardFiles();
    const refused = await client.callTool({
      name: "draft_cards",
      arguments: { feature: { title: "t", description: "d" }, stories: [story("Off")] },
    });
    expect(isError(refused)).toBe(true);
    expect(text(refused)).toBe("Not drafted. Featra MCP is off for this project.");
    expect(await cardFiles()).toEqual(before);
  });
});

/** A provider that is not Claude's adapter: it takes the MCP's description from the session options and nothing else. */
function otherProvider(seen: SessionOptions[]): ProviderAdapter {
  const choice = [{ value: "default", label: "Default" }];
  const chatSettings: ChatSettings = { role: "dev-lead", model: "default", effort: "default", mode: "default" };
  return {
    id: "claude",
    name: "Another agent",
    installed: async () => true,
    start: (options) => {
      seen.push(options);
      return { send: () => {}, configure: () => {}, interrupt: async () => {}, close: () => {}, sessionId: () => null };
    },
    controls: () => ({ models: choice, efforts: choice, modes: choice }),
    settings: () => chatSettings,
    history: async () => [],
  };
}

describe("AC4: from any provider's chat", () => {
  let manager: ChatManager;
  afterEach(() => manager.close());

  it("reaches draft_cards from the MCP description a non-Claude adapter is given, with no Claude-only step", async () => {
    const seen: SessionOptions[] = [];
    manager = createChatManager({
      providers: [otherProvider(seen)],
      roles: createRoleRegistry(),
      mcp: { attach: (chat) => bridge.attach(chat), release: (chat) => bridge.release(chat) },
    });
    const id = await manager.start(project, "dev-lead");
    const spec = await seen[0]?.mcp?.();
    expect(spec).toMatchObject({ name: "featra", args: [MAIN] });
    // The server takes the chat from its secret: this chat's, whatever the agent says.
    expect(bridge.resolve(spec?.env.FEATRA_AGENT_TOKEN ?? "")).toBe(id);
    expect(spec).not.toHaveProperty("allowedTools");
  });
});
