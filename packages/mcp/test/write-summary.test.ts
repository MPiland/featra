/**
 * STORY-69 AC6 (the MCP side): `write_summary` through the real Featra MCP process over stdio, into a real Featra
 * server (its WebSocket, agent bridge, scanner, feature start and summary writer) and a real git repository. Only the
 * platform is faked: the chat list the server asks about, the clock, and the agent (the test is the MCP host).
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DEV_LEAD_ROLE, newCard, parseCard, serializeCard, setStatus, summaryOf } from "@featra/work-format";
import {
  createAgentBridge,
  createAllowedProjects,
  createFeatureStart,
  createFeatureSummary,
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
const LEAD = "chat-1";
const WORKER = "chat-2";
const RESEARCHER = "chat-3";
const NOW = new Date("2026-11-10T09:00:00Z");
const now = () => NOW;
const CARD = ".featra/cards/FEAT-1-card.md";
const BRANCH = "feature/1-review";

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

const feature = (id: string, title: string, status: string) =>
  setStatus(
    newCard({ id, type: "feature", title, status: "draft", parent: null }, "user", "2026-11-10T08:00:00Z"),
    status,
    "user",
    "2026-11-10T08:30:00Z",
  );

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "featra-mcp-summary-")));
  project = join(root, "project");
  await mkdir(join(project, ".featra", "cards"), { recursive: true });
  git(project, "init", "-q", "-b", "main");
  git(project, "config", "core.autocrlf", "false");
  git(project, "config", "user.name", "Test");
  git(project, "config", "user.email", "test@example.invalid");
  git(project, "config", "commit.gpgsign", "false");
  await writeFile(join(project, ".featra", "config.yaml"), "version: 1\n");
  for (const c of [feature("FEAT-1", "Review", "approved"), feature("FEAT-2", "Later", "approved")]) {
    await writeFile(join(project, ".featra", "cards", `${c.id}-card.md`), serializeCard(c));
  }
  git(project, "add", "-A");
  git(project, "commit", "-q", "-m", "plan");

  scanner = createScanner(createRepoGit());
  const starts = createFeatureStart({ scan: scanner.scan, now });
  await starts.start(project, "FEAT-1", "user");
  bridge = createAgentBridge({
    entry: MAIN,
    enabled: () => Promise.resolve(settings.enabled),
    chats: {
      info: (id) =>
        id === LEAD
          ? { dir: project, session: "Dev Lead chat 1a2b3c4d", role: DEV_LEAD_ROLE }
          : id === WORKER
            ? { dir: project, session: "STORY-1 session", story: true, role: "developer" }
            : id === RESEARCHER
              ? { dir: project, session: "Researcher chat 5e6f7a8b", role: "researcher" }
              : null,
      report: () => {},
      retitle: () => {},
    },
    writer: createLogWriter({ fs: { read: async () => null, write: async () => {} }, now }),
    summaries: createFeatureSummary({ scan: scanner.scan, now }),
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

async function agent(chat = LEAD): Promise<Client> {
  const spec = await bridge.attach({ id: chat, dir: project });
  if (!spec) throw new Error("The bridge offered no MCP.");
  const client = new Client({ name: "agent", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ ...spec, stderr: "pipe" }));
  clients.push(client);
  return client;
}

const text = (result: unknown) => (result as { content: { text: string }[] }).content[0]?.text ?? "";
const isError = (result: unknown) => (result as { isError?: boolean }).isError === true;
const call = (client: Client, args: Record<string, unknown>) =>
  client.callTool({ name: "write_summary", arguments: args });
const onBranch = () => parseCard(git(project, "show", `${BRANCH}:${CARD}`));

describe("write_summary through the Featra MCP (STORY-69 AC6)", () => {
  it("is listed with the description that teaches the Dev Lead when and what to write", async () => {
    const { tools } = await (await agent()).listTools();
    const tool = tools.find((t) => t.name === "write_summary");
    expect(tool?.description).toBe(TOOLS.find((t) => t.name === "write_summary")?.description);
    for (const cue of ["review", "plain language", "replaces", "written by the dev lead"]) {
      expect(tool?.description?.toLowerCase()).toContain(cue);
    }
    expect(tool?.inputSchema.required).toEqual(["feature", "summary"]);
  });

  it("writes the summary into the feature's card on its branch, as the Dev Lead's chat", async () => {
    const written = await call(await agent(), { feature: "FEAT-1", summary: "Review a feature on one screen." });
    expect(isError(written)).toBe(false);
    expect(text(written)).toBe("Wrote the summary of FEAT-1. The user sees it on its review screen.");
    const card = onBranch();
    expect(summaryOf(card)).toEqual({ text: "Review a feature on one screen.", at: "2026-11-10T09:00:00Z" });
    expect(card.history.at(-1)).toMatchObject({ field: "summary", by: `session:${LEAD}` });
    expect(git(project, "log", "-1", "--format=%s", BRANCH)).toBe("FEAT-1: summary by the Dev Lead");
    expect(git(project, "symbolic-ref", "HEAD")).toBe("refs/heads/main");
  });

  it("refuses a story session, any other chat that isn't the Dev Lead, a feature not in progress, bad input and a project with the MCP off", async () => {
    const before = git(project, "rev-parse", BRANCH);
    const worker = await call(await agent(WORKER), { feature: "FEAT-1", summary: "Mine." });
    expect(isError(worker)).toBe(true);
    expect(text(worker)).toBe("Not written. A story session can't write a feature's summary. Report to the Dev Lead.");
    // It reads as written by the Dev Lead, so no other chat may write it either.
    const researcher = await call(await agent(RESEARCHER), { feature: "FEAT-1", summary: "Mine too." });
    expect(isError(researcher)).toBe(true);
    expect(text(researcher)).toBe("Not written. Only the Dev Lead writes a feature's summary.");
    const lead = await agent();
    const later = await call(lead, { feature: "FEAT-2", summary: "Soon." });
    expect(text(later)).toBe("Not written. FEAT-2 isn't a feature in progress.");
    const story = await call(lead, { feature: "STORY-1", summary: "x" });
    expect(text(story)).toBe("Not written. Give the feature's id, such as FEAT-9, as `feature`.");
    settings.enabled = false;
    const off = await call(lead, { feature: "FEAT-1", summary: "Off." });
    expect(text(off)).toBe("Not written. Featra MCP is off for this project.");
    expect(git(project, "rev-parse", BRANCH)).toBe(before);
  });
});
