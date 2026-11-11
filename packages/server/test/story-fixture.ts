/**
 * The shared world of the STORY-9 tests: a real git repository with an approved and started feature and its stories, the
 * real services, window socket and agent socket. Only the Agent SDK and the clock are faked.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_PATH, parseCard, type ChatEvent, type ChatSummary } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { fakeClaude } from "./fake-query.ts";
import { FIRST_ANSWER_MS, until } from "./until.ts";
import { openFrames, type FrameSocket, type SocketFrame } from "./ws-frames.ts";

const TOKEN = "test-token-0123456789";
export const clockNow = new Date("2026-11-10T12:00:00Z");

export interface Client {
  socket: FrameSocket<unknown>;
  /** One request, answered with its frame. */
  ask: (method: string, params: unknown) => Promise<SocketFrame>;
  /** Watches a chat; its events, as pushed so far. */
  watch: (chat: string) => Promise<() => ChatEvent[]>;
  close: () => void;
}

async function clientOf(socket: FrameSocket<unknown>): Promise<Client> {
  let n = 1;
  const ask: Client["ask"] = async (method, params) => {
    const id = n++;
    socket.send({ id, method, params });
    return socket.next((f) => f.id === id, FIRST_ANSWER_MS);
  };
  return {
    socket,
    ask,
    async watch(chat) {
      const id = n++;
      socket.send({ id, method: "chat.watch", params: { id: chat } });
      const first = await socket.next((f) => f.id === id, FIRST_ANSWER_MS);
      const kept = ((first.result as { events: ChatEvent[] }).events ?? []).slice();
      return () => [
        ...kept,
        ...socket.frames.filter((f) => f.event === "chat.event" && f.watch === id).map((f) => f.data as ChatEvent),
      ];
    },
    close: () => socket.close(),
  };
}

export const story = (id: string, title: string, status = "New") => ({
  ...card(id, "story", "FEAT-2", status),
  title,
  description: `Do ${title}.`,
});

export interface WorldOptions {
  /** More lines for `.featra/config.yaml` of the project. */
  config?: string;
  claude?: ReturnType<typeof fakeClaude>;
  /** Opens the project as a linked worktree of the repository (a second checkout of the same repo). */
  linked?: boolean;
  /** FEAT-2 was drafted by a Dev Lead chat of the project (its card says which); `drafter` is that chat's id. */
  drafted?: boolean;
}

export async function storyWorld({
  config = "",
  claude = fakeClaude(),
  linked = false,
  drafted = false,
}: WorldOptions = {}) {
  const allowed = createAllowedProjects();
  const services = createServices({
    allowed,
    log: () => {},
    now: () => clockNow,
    claude: claude.deps,
    mcpEntry: fileURLToPath(import.meta.url),
  });
  const repo: CardRepo = await cardRepo();
  repo.git(repo.main, "config", "user.name", "Test");
  repo.git(repo.main, "config", "user.email", "test@example.invalid");
  let drafter = "";
  if (drafted) {
    allowed.set([repo.main]);
    const noWatch = { push: () => {}, keep: () => {}, unwatch: () => false };
    drafter = ((await services.api("chat.start", { dir: repo.main, role: "dev-lead" }, 0, noWatch)) as { id: string })
      .id;
  }
  await repo.write(repo.main, {
    ...card("FEAT-2", "feature", null, "approved"),
    title: "Delegation",
    ...(drafted ? { extra: { "drafted-by": drafter } } : {}),
  });
  await repo.write(repo.main, story("STORY-5", "Spawn five"));
  await repo.write(repo.main, story("STORY-6", "Spawn six", "Ready"));
  await repo.write(repo.main, story("STORY-7", "Spawn seven"));
  await repo.write(repo.main, story("STORY-8", "Spawn eight", "Done"));
  for (const n of [9, 10, 11, 12, 13]) await repo.write(repo.main, story(`STORY-${n}`, `Spawn ${n}`));
  repo.commit(repo.main, "plan");
  // The project's folder: the repository itself, or a linked worktree of it.
  const dir = linked ? repo.worktree("linked-checkout", "linked") : repo.main;
  allowed.set([dir]);
  const server: RunningServer = await startServer({
    token: TOKEN,
    api: services.api,
    agents: services.agents,
    log: () => {},
  });
  services.agents.setPort(server.port);
  const clients: Client[] = [];
  const open = async () => {
    const c = await clientOf(await openFrames(`${server.url}?token=${TOKEN}`));
    clients.push(c);
    return c;
  };
  const window = await open();
  const started = await window.ask("feature.start", { dir, id: "FEAT-2" });
  if (started.ok !== true) throw new Error(`Feature didn't start: ${String(started.error)}`);
  if (config) {
    await writeFile(join(dir, ".featra", "config.yaml"), `version: 1\n${config}`);
  }

  /** A Dev Lead chat in the project, with its agent socket open as its MCP process would. */
  async function devLead(role = "dev-lead") {
    const made = await window.ask("chat.start", { dir, role });
    const id = (made.result as { id: string }).id;
    const events = await window.watch(id);
    const secret = (await services.agents.attach({ id, dir }))?.env.FEATRA_AGENT_TOKEN ?? "";
    const agent = await clientOf(
      await openFrames(`ws://127.0.0.1:${server.port}${AGENT_PATH}?token=${encodeURIComponent(secret)}`),
    );
    clients.push(agent);
    return { id, events, agent };
  }

  /** A Dev Lead chat whose agent runs (so it has a mode and rules), and the run it started. */
  async function runningLead(mode?: string) {
    const lead = await devLead();
    if (mode) await window.ask("chat.configure", { id: lead.id, change: { mode } });
    const before = claude.runs.length;
    await window.ask("chat.send", { id: lead.id, text: "Plan the work." });
    await until(() => (claude.runs[before]?.heard.length ?? 0) === 1);
    return { ...lead, run: claude.runs[before]! };
  }

  /** The lead (or any chat with an agent socket) spawns `story`; the session's chat and its run, once it heard its first message. */
  async function spawnAs(lead: { agent: Client }, storyId: string) {
    const before = claude.runs.length;
    const id = Math.floor(Math.random() * 1e6);
    lead.agent.socket.send({ id, method: "story.spawn", params: { story: storyId } });
    const answered = await lead.agent.socket.next((f) => f.id === id, 20_000);
    if (answered.ok !== true) throw new Error(`Spawn refused: ${String(answered.error)}`);
    await until(() => (claude.runs[before]?.heard.length ?? 0) === 1);
    return { chat: (answered.result as { chat: string }).chat, run: claude.runs[before]! };
  }

  /** A chat's own agent socket, as its MCP process would open it (a story session's too). */
  async function agentOf(id: string) {
    const secret = (await services.agents.attach({ id, dir }))?.env.FEATRA_AGENT_TOKEN ?? "";
    const agent = await clientOf(
      await openFrames(`ws://127.0.0.1:${server.port}${AGENT_PATH}?token=${encodeURIComponent(secret)}`),
    );
    clients.push(agent);
    return agent;
  }

  const chatList = async (): Promise<ChatSummary[]> => {
    const listed = await window.ask("chat.list", { dir });
    return (listed.result as { chats: ChatSummary[] }).chats;
  };
  const sessions = async () => (await chatList()).filter((c) => c.story);
  const cardIn = async (id: string, tree = dir) => parseCard(await repo.read(tree, id));

  return {
    repo,
    dir,
    drafter,
    allowed,
    claude,
    services,
    window,
    open,
    devLead,
    runningLead,
    agentOf,
    spawnAs,
    chatList,
    sessions,
    card: cardIn,
    until,
    async close() {
      for (const c of clients) c.close();
      await server.close();
      await services.close();
      await repo.dispose();
    },
  };
}

export type StoryWorld = Awaited<ReturnType<typeof storyWorld>>;
