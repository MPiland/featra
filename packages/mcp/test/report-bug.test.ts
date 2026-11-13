/**
 * STORY-13 (the MCP side): `report_bug` through the real Featra MCP process over stdio, into the real Featra services
 * (agent bridge, bug request, approval desk, Inbox, filing) on a real git repository with one card. The Dev Lead chat
 * never runs a turn here, so the Agent SDK is not exercised; the server tests answer the request.
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BUG_COPY,
  newCard,
  REPORT_BUG_MESSAGES,
  REPORT_BUG_TOOL,
  serializeCard,
  type Inbox,
} from "@featra/work-format";
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

const gitEnv = (() => {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return {
    ...env,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "t@example.invalid",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "t@example.invalid",
  };
})();
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env: gitEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const claude: ClaudeDeps = {
  locate: async () => "/usr/local/bin/claude",
  env: {},
  loadQuery: async () => (() => ({})) as never,
};

let root = "";
let project = "";
let server: RunningServer;
let services: ReturnType<typeof createServices>;
let lead: Client;
const connection = { push: () => {}, keep: () => {}, unwatch: () => false };
const call = (method: Parameters<Api>[0], params: unknown) => services.api(method, params, 1, connection);
const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]?.text ?? "";
const isError = (r: unknown) => (r as { isError?: boolean }).isError === true;
const report = (args: Record<string, unknown>) => lead.callTool({ name: REPORT_BUG_TOOL, arguments: args });

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "featra-mcp-bug-")));
  project = join(root, "project");
  await mkdir(join(project, ".featra", "cards"), { recursive: true });
  git(project, "init", "-q", "-b", "main");
  git(project, "config", "core.autocrlf", "false");
  await writeFile(join(project, ".featra", "config.yaml"), "version: 1\n");
  const done = newCard(
    { id: "FEAT-1", type: "feature", title: "Delegation", status: "done", parent: null },
    "user",
    "2026-11-10T08:00:00Z",
  );
  await writeFile(join(project, ".featra", "cards", "FEAT-1-delegation.md"), serializeCard(done));
  git(project, "add", "-A");
  git(project, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "init");
  const allowed = createAllowedProjects();
  allowed.set([project]);
  services = createServices({ allowed, log: () => {}, claude, mcpEntry: MAIN });
  server = await startServer({
    token: "window-token-0123456789",
    api: services.api,
    agents: services.agents,
    log: () => {},
  });
  services.agents.setPort(server.port);
  const id = ((await call("chat.start", { dir: project, role: "dev-lead" })) as { id: string }).id;
  const spec = await services.agents.attach({ id, dir: project });
  if (!spec) throw new Error("The bridge offered no MCP.");
  lead = new Client({ name: "agent", version: "0.0.0" });
  await lead.connect(new StdioClientTransport({ ...spec, stderr: "pipe" }));
}, 60_000);

afterAll(async () => {
  await lead.close();
  await server.close();
  await services.close();
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

describe("report_bug through the Featra MCP (AC1)", () => {
  it("is listed with a description that teaches the placement and the user's confirm", async () => {
    const { tools } = await lead.listTools();
    const tool = tools.find((t) => t.name === REPORT_BUG_TOOL);
    expect(tool?.description).toBe(TOOLS.find((t) => t.name === REPORT_BUG_TOOL)?.description);
    expect(tool?.inputSchema.required).toEqual(["title"]);
    for (const taught of ["suspect caused it", "project bug list", "confirms or changes", "notice", "Story sessions"]) {
      expect(tool?.description).toContain(taught);
    }
  });

  it("asks the user with Featra's proposal, in the Inbox, and writes nothing yet", async () => {
    const result = await report({ title: "Spawn hangs", description: "It never returns.", cause: "FEAT-1" });
    expect(isError(result)).toBe(false);
    expect(text(result)).toBe(REPORT_BUG_MESSAGES.asked);
    const inbox = (await call("inbox.watch", { dir: project, waitMs: 0 })) as Inbox;
    const item = inbox.items.find((i) => i.request.type === "approval" && i.request.name === REPORT_BUG_TOOL);
    const request = item?.request.type === "approval" ? item.request : undefined;
    // FEAT-1 is Done: it stays Done, so the bug goes on the project bug list.
    expect(request?.input).toEqual({
      title: "Spawn hangs",
      description: "It never returns.",
      cause: "FEAT-1",
      proposed: "project",
      choices: [{ key: "project", label: BUG_COPY.project }],
    });
    expect((await readdir(join(project, ".featra", "cards"))).filter((n) => n.startsWith("BUG-"))).toEqual([]);
  });

  it("tells the agent what to fix in one sentence when it is refused", async () => {
    const none = await report({});
    expect(isError(none)).toBe(true);
    expect(text(none)).toBe(`Not reported. ${REPORT_BUG_MESSAGES.badTitle}`);
    const unknown = await report({ title: "T", cause: "STORY-404" });
    expect(text(unknown)).toBe(`Not reported. ${REPORT_BUG_MESSAGES.unknownCause("STORY-404")}`);
  });
});
