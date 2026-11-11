/**
 * STORY-10 (the MCP side): `update_card` through the real Featra MCP process over stdio, into the real Featra services
 * (agent bridge, WebSocket server, story runner, worktrees, card writes, chat manager) on a real git repository with a
 * started feature. Only the platform is faked: the Agent SDK (a recording `query`) and the clock. The host is a story
 * session's own MCP process, as it is when the agent runs.
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evidenceState, newCard, parseCard, serializeCard, setStatus } from "@featra/work-format";
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
const FOLDER = ".featra/evidence/FEAT-1/STORY-9/";

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

/** The Agent SDK's `query`, faked: it records each session's messages and never answers. */
const claude: ClaudeDeps = {
  locate: async () => "/usr/local/bin/claude",
  env: {},
  loadQuery: async () =>
    (({ prompt }: { prompt: AsyncIterable<unknown> }) => {
      let done!: () => void;
      const over = new Promise<void>((resolve) => (done = resolve));
      void (async () => {
        for await (const m of prompt) void m;
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
let worktree = "";
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
const update = (client: Client, args: Record<string, unknown>) =>
  client.callTool({ name: "update_card", arguments: args });
const cardFile = () => readFile(join(worktree, ".featra", "cards", "STORY-9-card.md"), "utf8");

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "featra-mcp-update-")));
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
  for (const id of ["STORY-9", "STORY-10"]) {
    const started = await leadClient.callTool({ name: "spawn_session", arguments: { story: id } });
    if (isError(started)) throw new Error(`Spawn refused: ${text(started)}`);
  }
  const listed = (await call("chat.list", { dir: project })) as { chats: { id: string; story?: { id: string } }[] };
  nine = listed.chats.find((c) => c.story?.id === "STORY-9")?.id ?? "";
  if (nine === "") throw new Error("No story session for STORY-9.");
  worktree = join(project, ".claude", "worktrees", "STORY-9-spawn-nine");
  // The owner copy is the worktree's: give the story a criterion and a task to tick.
  const card = parseCard(await cardFile());
  await writeFile(
    join(worktree, ".featra", "cards", "STORY-9-card.md"),
    serializeCard({
      ...card,
      acs: [{ text: "It reports", done: false, test: null }],
      tasks: [{ text: "Report it", done: false }],
    }),
  );
}, 60_000);

afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
  await server.close();
  await services.close();
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

describe("update_card through the Featra MCP", () => {
  it("is listed with a description that teaches the stages, the claim, the limits and the evidence folder", async () => {
    const { tools } = await (await agent(nine)).listTools();
    const tool = tools.find((t) => t.name === "update_card");
    expect(tool?.description).toBe(TOOLS.find((t) => t.name === "update_card")?.description);
    expect(tool?.inputSchema.required ?? []).toEqual([]);
    for (const taught of [
      "Reported",
      "Acceptance",
      "Done",
      ".featra/evidence/<FEAT-N>/<STORY-M>/",
      "1 MB",
      "Dev Lead",
      "commit",
    ]) {
      expect(tool?.description).toContain(taught);
    }
  });

  it("updates the story session's own card in its worktree, and says what changed: Reported, not committed", async () => {
    await mkdir(join(worktree, ...FOLDER.split("/")), { recursive: true });
    await writeFile(join(worktree, ...FOLDER.split("/"), "report.png"), "png");
    const result = await update(await agent(nine), {
      stage: "In Review",
      tasks: ["report it"],
      addTasks: ["Show it"],
      criteria: [{ criterion: "It reports", evidence: `${FOLDER}report.png` }],
      note: "Done.",
    });
    expect(isError(result)).toBe(false);
    expect(text(result)).toBe(
      "Updated STORY-9: moved to In Review, ticked 1 task, added 1 task, ticked 1 criterion, linked 1 evidence file, added a note. Reported, not committed: commit the card and its evidence with your work.",
    );
    const card = parseCard(await cardFile());
    expect(card.status).toBe("In Review");
    expect(card.acs[0]).toMatchObject({ done: true, evidence: `${FOLDER}report.png` });
    expect(card.history.at(-1)).toMatchObject({ field: "report", by: `session:${nine}` });
    expect(evidenceState(card)).toMatchObject({ reported: true, accepted: false });
    expect(parseCard(await readFile(join(project, ".featra", "cards", "STORY-9-card.md"), "utf8")).status).toBe("New");
    expect(git(worktree, "log", "--format=%s", "-1")).not.toContain("STORY-9");
  });

  it("says when there was nothing to change", async () => {
    expect(text(await update(await agent(nine), { tasks: ["Report it"] }))).toBe("Nothing to change on STORY-9.");
  });

  it("tells the agent why in one sentence when it is refused, and writes nothing", async () => {
    const client = await agent(nine);
    const before = await cardFile();
    const refused = async (args: Record<string, unknown>) => {
      const r = await update(client, args);
      expect(isError(r)).toBe(true);
      return text(r);
    };
    expect(await refused({ stage: "Done" })).toBe(
      "Not updated. Only the user moves STORY-9 to Done, once it is verified and accepted; move it to Acceptance.",
    );
    expect(await refused({ card: "STORY-10", note: "x" })).toBe(
      "Not updated. A story session can update only its own card, STORY-9.",
    );
    expect(await refused({ criteria: [{ criterion: "It reports", evidence: "docs/a.png" }] })).toContain(
      `Not updated. Evidence goes in ${FOLDER}`,
    );
    expect(await refused({})).toBe("Not updated. Say what to update: stage, tasks, addTasks, criteria or note.");
    expect(await cardFile()).toBe(before);
  });

  it("refuses any other chat: this Dev Lead did not draft the feature", async () => {
    const r = await update(await agent(lead), { card: "STORY-9", note: "x" });
    expect(isError(r)).toBe(true);
    expect(text(r)).toBe(
      "Not updated. STORY-9 isn't yours to update: only its own story session and its feature's Dev Lead can.",
    );
  });
});
