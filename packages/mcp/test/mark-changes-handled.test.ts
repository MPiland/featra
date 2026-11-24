/**
 * STORY-71 AC3 (the MCP side): `mark_changes_handled` through the real Featra MCP process over stdio, into a real
 * Featra server (its WebSocket, agent bridge, scanner, feature start and changes module) and a real git repository.
 * Only the platform is faked: the chat list the server asks about, the clock, and the agent (the test is the MCP host).
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  changesOf,
  DEV_LEAD_ROLE,
  MARK_CHANGES_HANDLED_TOOL,
  newCard,
  parseCard,
  recordChangesAsked,
  serializeCard,
  setStatus,
} from "@featra/work-format";
import {
  createAgentBridge,
  createAllowedProjects,
  createFeatureChanges,
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

/** The chats the server would ask about to send a reason; this test only marks changes handled, which sends nothing. */
const noChats = {
  list: () => [],
  dirOf: () => null,
  open: () => Promise.reject(new Error("No chats here.")),
  send: () => {
    throw new Error("No chats here.");
  },
};

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "featra-mcp-changes-")));
  project = join(root, "project");
  await mkdir(join(project, ".featra", "cards"), { recursive: true });
  git(project, "init", "-q", "-b", "main");
  git(project, "config", "core.autocrlf", "false");
  git(project, "config", "user.name", "Test");
  git(project, "config", "user.email", "test@example.invalid");
  git(project, "config", "commit.gpgsign", "false");
  await writeFile(join(project, ".featra", "config.yaml"), "version: 1\n");
  // FEAT-1 has changes asked (as "Not yet" records them); FEAT-2 isn't in progress.
  const asked = recordChangesAsked(
    feature("FEAT-1", "Review", "approved"),
    "Rename Save.",
    "user",
    "2026-11-10T08:40:00Z",
  );
  for (const c of [asked, feature("FEAT-2", "Later", "approved")]) {
    await writeFile(join(project, ".featra", "cards", `${c.id}-card.md`), serializeCard(c));
  }
  git(project, "add", "-A");
  git(project, "commit", "-q", "-m", "plan");

  scanner = createScanner(createRepoGit());
  await createFeatureStart({ scan: scanner.scan, now }).start(project, "FEAT-1", "user");
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
    changes: createFeatureChanges({ scan: scanner.scan, now, chats: noChats }),
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
  client.callTool({ name: MARK_CHANGES_HANDLED_TOOL, arguments: args });
const onBranch = () => parseCard(git(project, "show", `${BRANCH}:${CARD}`));

describe("mark_changes_handled through the Featra MCP (STORY-71 AC3)", () => {
  it("is listed with the description that teaches the Dev Lead when to call it and that a chat reply isn't enough", async () => {
    const { tools } = await (await agent()).listTools();
    const tool = tools.find((t) => t.name === MARK_CHANGES_HANDLED_TOOL);
    expect(tool?.description).toBe(TOOLS.find((t) => t.name === MARK_CHANGES_HANDLED_TOOL)?.description);
    for (const cue of ["changes asked on feat-n", "answering in the chat isn't enough", "written by the dev lead"]) {
      expect(tool?.description?.toLowerCase()).toContain(cue);
    }
    expect(tool?.inputSchema.required).toEqual(["feature", "reply"]);
  });

  it("refuses a story session, any other chat that isn't the Dev Lead, a feature not in progress, bad input and a project with the MCP off", async () => {
    const before = git(project, "rev-parse", BRANCH);
    const worker = await call(await agent(WORKER), { feature: "FEAT-1", reply: "Mine." });
    expect(isError(worker)).toBe(true);
    expect(text(worker)).toBe(
      "Not marked. A story session can't mark a feature's changes handled. Report to the Dev Lead.",
    );
    const researcher = await call(await agent(RESEARCHER), { feature: "FEAT-1", reply: "Mine too." });
    expect(text(researcher)).toBe("Not marked. Only the Dev Lead marks a feature's changes handled.");
    const lead = await agent();
    expect(text(await call(lead, { feature: "FEAT-2", reply: "Soon." }))).toBe(
      "Not marked. FEAT-2 isn't a feature in progress.",
    );
    expect(text(await call(lead, { feature: "FEAT-1", reply: " " }))).toBe(
      "Not marked. Say what you changed as `reply`, in plain language for the user.",
    );
    settings.enabled = false;
    expect(text(await call(lead, { feature: "FEAT-1", reply: "Off." }))).toBe(
      "Not marked. Featra MCP is off for this project.",
    );
    expect(git(project, "rev-parse", BRANCH)).toBe(before);
  });

  it("records the Dev Lead's reply on the feature's branch, which clears Changes asked; a second call is refused", async () => {
    const lead = await agent();
    const marked = await call(lead, { feature: "FEAT-1", reply: "Renamed Save to Keep." });
    expect(isError(marked)).toBe(false);
    expect(text(marked)).toBe("Marked the changes on FEAT-1 handled. The user sees your reply on its review screen.");
    const card = onBranch();
    expect(card.history.at(-1)).toEqual({
      at: "2026-11-10T09:00:00Z",
      field: "changes-handled",
      from: null,
      to: "Renamed Save to Keep.",
      by: `session:${LEAD}`,
    });
    expect(changesOf(card)?.reply).toEqual({ text: "Renamed Save to Keep.", at: "2026-11-10T09:00:00Z" });
    expect(git(project, "log", "-1", "--format=%s", BRANCH)).toBe("FEAT-1: changes handled by the Dev Lead");
    expect(git(project, "symbolic-ref", "HEAD")).toBe("refs/heads/main");
    const again = await call(lead, { feature: "FEAT-1", reply: "Again." });
    expect(text(again)).toBe(
      "Not marked. No changes are asked on FEAT-1: the user may have dismissed them. Nothing was recorded.",
    );
  });
});
