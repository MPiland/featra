/**
 * STORY-47 through the real services, socket and disk: a chat's agent logs over its MCP's socket, the window's watcher
 * sees it, and `chat.undoLog` takes it back. Only the Agent SDK's `query` and the PATH lookup are fake.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENT_PATH, CHAT_MESSAGES, type ChatEvent } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { fakeClaude } from "./fake-query.ts";
import { tempFolder } from "./temp-folder.ts";
import { until } from "./until.ts";
import { openFrames, type FrameSocket } from "./ws-frames.ts";

const TOKEN = "test-token-0123456789";
const DECISION = { kind: "decision", decision: "Use a socket", why: "Scoped secrets.", rejected: [], card: "STORY-47" };
const allowed = createAllowedProjects();
const claude = fakeClaude("/usr/local/bin/claude");
let services: ReturnType<typeof createServices>;
let server: RunningServer;
let project: Awaited<ReturnType<typeof tempFolder>>;
let data: Awaited<ReturnType<typeof tempFolder>>;
const open = <D>(url: string) => openFrames<D>(url);

beforeAll(async () => {
  project = await tempFolder();
  data = await tempFolder();
  allowed.set([project.dir]);
  // The bundled MCP, which the bridge checks is there before it offers it.
  await writeFile(join(data.dir, "mcp.cjs"), "");
  services = createServices({
    allowed,
    log: () => {},
    claude: claude.deps,
    dataDir: data.dir,
    mcpEntry: join(data.dir, "mcp.cjs"),
  });
  server = await startServer({ token: TOKEN, api: services.api, agents: services.agents, log: () => {} });
  services.agents.setPort(server.port);
});
afterAll(async () => {
  await server.close();
  await services.close();
  await project.dispose();
  await data.dispose();
});

/** Starts a Developer chat in `dir` and sends a message, so its agent session (and MCP) starts. */
async function started(socket: FrameSocket<ChatEvent>, dir: string, n: number) {
  const before = claude.runs.length;
  socket.send({ id: n, method: "chat.start", params: { dir, role: "developer" } });
  const first = await socket.next((f) => f.id === n);
  if (!first.ok) throw new Error(`chat.start: ${first.error}`);
  const { id } = first.result as { id: string };
  socket.send({ id: n + 1, method: "chat.watch", params: { id } });
  await socket.next((f) => f.id === n + 1);
  socket.send({ id: n + 2, method: "chat.send", params: { id, text: "go" } });
  await socket.next((f) => f.id === n + 2);
  await until(() => claude.runs.length > before && (claude.runs[before]?.heard.length ?? 0) > 0);
  return { id, run: claude.runs[before]! };
}

type Spec = { env: Record<string, string> };
const specOf = (run: { options: { mcpServers?: unknown } }) =>
  (run.options.mcpServers as Record<string, Spec> | undefined)?.featra;

describe("an agent logs, the chat shows it, Undo takes it back", () => {
  it("runs the whole way over the sockets and the disk", async () => {
    const window = await open<ChatEvent>(`${server.url}?token=${TOKEN}`);
    try {
      const { id, run } = await started(window, project.dir, 1);
      const spec = specOf(run);
      expect(spec?.env.FEATRA_AGENT_URL).toBe(`ws://127.0.0.1:${server.port}${AGENT_PATH}`);

      const agent = await open(`${spec?.env.FEATRA_AGENT_URL}?token=${spec?.env.FEATRA_AGENT_TOKEN}`);
      agent.send({ id: 1, method: "log.append", params: DECISION });
      const answer = await agent.next((f) => f.id === 1);
      const { entry, file } = answer.result as { entry: string; file: string };
      expect(file).toBe("decisions.md");
      agent.close();

      const text = await readFile(join(project.dir, "decisions.md"), "utf8");
      expect(text).toContain("Use a socket");
      expect(text).toContain("  - Card: STORY-47");
      const event = (await window.next((f) => f.data?.type === "logged")).data;
      expect(event).toEqual({ type: "logged", entry, file: "decisions.md", summary: "Use a socket" });

      window.send({ id: 10, method: "chat.undoLog", params: { id, entry: "nope" } });
      expect(await window.next((f) => f.id === 10)).toEqual({ id: 10, ok: false, error: CHAT_MESSAGES.noEntry });
      window.send({ id: 11, method: "chat.undoLog", params: { id } });
      expect(await window.next((f) => f.id === 11)).toMatchObject({ ok: false, error: "Expected { id, entry }." });
      window.send({ id: 12, method: "chat.undoLog", params: { id, entry } });
      expect(await window.next((f) => f.id === 12)).toEqual({ id: 12, ok: true, result: null });
      expect(await readFile(join(project.dir, "decisions.md"), "utf8")).not.toContain("Use a socket");
      expect((await window.next((f) => f.data?.type === "log-undone")).data).toEqual({ type: "log-undone", entry });
    } finally {
      window.close();
    }
  });

  it("refuses Undo of an entry the user edited, and leaves the file alone", async () => {
    const window = await open<ChatEvent>(`${server.url}?token=${TOKEN}`);
    try {
      const { id, run } = await started(window, project.dir, 20);
      const spec = specOf(run);
      const agent = await open(`${spec?.env.FEATRA_AGENT_URL}?token=${spec?.env.FEATRA_AGENT_TOKEN}`);
      agent.send({ id: 1, method: "log.append", params: DECISION });
      const { entry } = (await agent.next((f) => f.id === 1)).result as { entry: string };
      agent.close();
      const file = join(project.dir, "decisions.md");
      const edited = (await readFile(file, "utf8")).replace("Scoped secrets.", "Scoped secrets, reworded.");
      await writeFile(file, edited);
      window.send({ id: 30, method: "chat.undoLog", params: { id, entry } });
      expect(await window.next((f) => f.id === 30)).toEqual({ id: 30, ok: false, error: CHAT_MESSAGES.editedEntry });
      expect(await readFile(file, "utf8")).toBe(edited);
    } finally {
      window.close();
    }
  });
});

/** Whether a chat started in `dir` is given the MCP. */
async function offered(dir: string, n: number) {
  const window = await open<ChatEvent>(`${server.url}?token=${TOKEN}`);
  try {
    return specOf((await started(window, dir, n)).run) !== undefined;
  } finally {
    window.close();
  }
}

describe("AC1: the setting turns the MCP off", () => {
  const opened: string[] = [];
  async function folderWith(config: string | null) {
    const folder = await tempFolder();
    allowed.set([project.dir, ...opened, folder.dir]);
    opened.push(folder.dir);
    if (config !== null) {
      await mkdir(join(folder.dir, ".featra"), { recursive: true });
      await writeFile(join(folder.dir, ".featra", "config.yaml"), config);
    }
    return folder;
  }

  it("is on with no setting anywhere, off when the project says so", async () => {
    const plain = await folderWith(null);
    const off = await folderWith("version: 1\nmcp: false\n");
    try {
      expect(await offered(plain.dir, 40)).toBe(true);
      expect(await offered(off.dir, 50)).toBe(false);
    } finally {
      await plain.dispose();
      await off.dispose();
    }
  });

  it("follows the app default when the project sets nothing, and the project wins over it", async () => {
    await writeFile(join(data.dir, "settings.json"), JSON.stringify({ work: { mcp: false } }));
    const follows = await folderWith("version: 1\n");
    const overrides = await folderWith("version: 1\nmcp: true\n");
    try {
      expect(await offered(follows.dir, 60)).toBe(false);
      expect(await offered(overrides.dir, 70)).toBe(true);
    } finally {
      await writeFile(join(data.dir, "settings.json"), "{}");
      await follows.dispose();
      await overrides.dispose();
    }
  });
});
