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
}

export async function storyWorld({ config = "", claude = fakeClaude() }: WorldOptions = {}) {
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
  await repo.write(repo.main, { ...card("FEAT-2", "feature", null, "approved"), title: "Delegation" });
  await repo.write(repo.main, story("STORY-5", "Spawn five"));
  await repo.write(repo.main, story("STORY-6", "Spawn six", "Ready"));
  await repo.write(repo.main, story("STORY-7", "Spawn seven"));
  await repo.write(repo.main, story("STORY-8", "Spawn eight", "Done"));
  repo.commit(repo.main, "plan");
  allowed.set([repo.main]);
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
  const started = await window.ask("feature.start", { dir: repo.main, id: "FEAT-2" });
  if (started.ok !== true) throw new Error(`Feature didn't start: ${String(started.error)}`);
  if (config) {
    await writeFile(join(repo.main, ".featra", "config.yaml"), `version: 1\n${config}`);
  }

  /** A Dev Lead chat in the project, with its agent socket open as its MCP process would. */
  async function devLead(role = "dev-lead") {
    const made = await window.ask("chat.start", { dir: repo.main, role });
    const id = (made.result as { id: string }).id;
    const events = await window.watch(id);
    const secret = (await services.agents.attach({ id, dir: repo.main }))?.env.FEATRA_AGENT_TOKEN ?? "";
    const agent = await clientOf(
      await openFrames(`ws://127.0.0.1:${server.port}${AGENT_PATH}?token=${encodeURIComponent(secret)}`),
    );
    clients.push(agent);
    return { id, events, agent };
  }

  const chatList = async (): Promise<ChatSummary[]> => {
    const listed = await window.ask("chat.list", { dir: repo.main });
    return (listed.result as { chats: ChatSummary[] }).chats;
  };
  const sessions = async () => (await chatList()).filter((c) => c.story);
  const cardIn = async (id: string, tree = repo.main) => parseCard(await repo.read(tree, id));

  return {
    repo,
    claude,
    services,
    window,
    open,
    devLead,
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
