/**
 * STORY-56 (the MCP side): `propose_check_command` through the real Featra MCP process over stdio, into the real Featra
 * services on a real git repository. Only the Agent SDK is not exercised at all: the Dev Lead chat never runs a turn.
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROPOSE_MESSAGES, type ChecksView } from "@featra/work-format";
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
const propose = (args: Record<string, unknown>) => lead.callTool({ name: "propose_check_command", arguments: args });

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "featra-mcp-propose-")));
  project = join(root, "project");
  await mkdir(join(project, ".featra", "cards"), { recursive: true });
  git(project, "init", "-q", "-b", "main");
  git(project, "config", "core.autocrlf", "false");
  await writeFile(join(project, ".featra", "config.yaml"), "version: 1\n");
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

describe("propose_check_command through the Featra MCP (AC2)", () => {
  it("is listed with a description that says the user confirms it", async () => {
    const { tools } = await lead.listTools();
    const tool = tools.find((t) => t.name === "propose_check_command");
    expect(tool?.description).toBe(TOOLS.find((t) => t.name === "propose_check_command")?.description);
    expect(tool?.description).toContain("The user confirms or edits it there");
  });

  it("puts the proposal in Project settings and applies nothing", async () => {
    const result = await propose({ command: "pnpm run check" });
    expect(isError(result)).toBe(false);
    expect(text(result)).toBe(PROPOSE_MESSAGES.proposed);
    const view = (await call("checks.load", { dir: project })) as ChecksView;
    expect(view.proposals).toEqual([{ field: "command", value: "pnpm run check", source: "dev-lead" }]);
    expect(view.command).toBeNull();
    expect(await readFile(join(project, ".featra", "config.yaml"), "utf8")).toBe("version: 1\n");
  });

  it("tells the agent what to fix when the input is empty or not one line", async () => {
    const none = await propose({});
    expect(isError(none)).toBe(true);
    expect(text(none)).toBe(`Not proposed. ${PROPOSE_MESSAGES.none}`);
    const lines = await propose({ command: "a\nb" });
    expect(isError(lines)).toBe(true);
    expect(text(lines)).toBe(`Not proposed. ${PROPOSE_MESSAGES.bad("The check command")}`);
  });
});
