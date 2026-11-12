/**
 * STORY-52 AC1 and AC2 over the real sockets, on a real repository: the window's `feature.start` starts a feature as
 * `user`, and a chat's MCP calls `feature.start` on the agent socket with its secret and starts it as `session:<chat>`.
 * Real services (scanner, lane, chats, bridge) and git; only the Agent SDK and the clock are faked.
 */
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENT_PATH, parseCard, type Card } from "@featra/work-format";
import { createAgentBridge } from "../src/agent-bridge.ts";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { fakeClaude } from "./fake-query.ts";
import { FIRST_ANSWER_MS } from "./until.ts";
import { openFrames } from "./ws-frames.ts";

const TOKEN = "test-token-0123456789";
const allowed = createAllowedProjects();
const services = createServices({
  allowed,
  log: () => {},
  now: () => new Date("2026-11-10T12:00:00Z"),
  claude: fakeClaude().deps,
  mcpEntry: fileURLToPath(import.meta.url),
});
let server: RunningServer;
let repo: CardRepo;

const approved = (id: string, title: string): Card => ({ ...card(id, "feature", null, "approved"), title });
const onBranch = (branch: string, id: string) => parseCard(repo.show(repo.main, branch, id));
const open = () => openFrames(`${server.url}?token=${TOKEN}`);

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, approved("FEAT-2", "By the user"));
  await repo.write(repo.main, approved("FEAT-3", "By the Dev Lead"));
  await repo.write(repo.main, card("FEAT-4", "feature", null, "draft"));
  await repo.write(repo.main, card("STORY-5", "story", "FEAT-2", "New"));
  repo.git(repo.main, "config", "user.name", "Test");
  repo.git(repo.main, "config", "user.email", "test@example.invalid");
  repo.commit(repo.main, "plan");
  allowed.set([repo.main]);
  server = await startServer({ token: TOKEN, api: services.api, agents: services.agents, log: () => {} });
  services.agents.setPort(server.port);
});

afterAll(async () => {
  await server.close();
  await services.close();
  await repo.dispose();
});

describe("AC1: the window's feature.start", () => {
  it("is checked at the door, then starts the feature as user and answers with its branch", async () => {
    const socket = await open();
    try {
      let n = 1;
      const ask = async (method: string, params: unknown) => {
        const id = n++;
        socket.send({ id, method, params });
        return socket.next((f) => f.id === id, FIRST_ANSWER_MS);
      };
      expect(await ask("feature.start", { dir: repo.root, id: "FEAT-2" })).toMatchObject({
        ok: false,
        error: "Not an open project.",
      });
      expect(await ask("feature.start", { dir: repo.main })).toMatchObject({
        ok: false,
        error: "Expected { dir, id }.",
      });
      expect(await ask("feature.start", { dir: repo.main, id: "FEAT-4" })).toMatchObject({
        ok: false,
        error: "FEAT-4 isn't approved yet. Approve it first.",
      });
      expect(await ask("feature.start", { dir: repo.main, id: "FEAT-2" })).toMatchObject({
        ok: true,
        result: { branch: "feature/2-by-the-user" },
      });
      expect(await ask("feature.start", { dir: repo.main, id: "FEAT-2" })).toMatchObject({
        ok: false,
        error: "FEAT-2 is already active.",
      });
    } finally {
      socket.close();
    }
    const started = onBranch("feature/2-by-the-user", "FEAT-2");
    expect(started.status).toBe("active");
    expect(started.history.at(-1)).toMatchObject({ from: "approved", to: "active", by: "user" });
  });
});

describe("AC2: the Dev Lead's start_feature over the agent socket", () => {
  it("starts it as session:<chat>, and the chat's secret is what says which", async () => {
    const chat = (await services.api("chat.start", { dir: repo.main, role: "dev-lead" }, 1, {
      push: () => {},
      keep: () => {},
      unwatch: () => false,
    })) as { id: string };
    const secret = (await services.agents.attach({ id: chat.id, dir: repo.main }))?.env.FEATRA_AGENT_TOKEN ?? "";
    expect(secret).not.toBe("");
    const socket = await openFrames(`ws://127.0.0.1:${server.port}${AGENT_PATH}?token=${encodeURIComponent(secret)}`);
    try {
      socket.send({ id: 1, method: "feature.start", params: { feature: "FEAT-3" } });
      expect(await socket.next((f) => f.id === 1, FIRST_ANSWER_MS)).toMatchObject({
        ok: true,
        result: { branch: "feature/3-by-the-dev-lead" },
      });
      socket.send({ id: 2, method: "feature.start", params: { feature: "FEAT-3" } });
      expect(await socket.next((f) => f.id === 2, FIRST_ANSWER_MS)).toMatchObject({
        ok: false,
        error: "FEAT-3 is already active.",
      });
      socket.send({ id: 3, method: "feature.start", params: { feature: "nonsense" } });
      expect(await socket.next((f) => f.id === 3, FIRST_ANSWER_MS)).toMatchObject({
        ok: false,
        error: "Give the feature's id, such as FEAT-5, as `feature`.",
      });
    } finally {
      socket.close();
    }
    const started = onBranch("feature/3-by-the-dev-lead", "FEAT-3");
    expect(started.status).toBe("active");
    expect(started.history.at(-1)).toMatchObject({ from: "approved", to: "active", by: `session:${chat.id}` });
  });

  it("is refused when the project's knowledge setting is read-only, and when starting isn't wired", async () => {
    const chats = { info: () => ({ dir: repo.main, session: "Dev Lead chat" }), report: () => {}, retitle: () => {} };
    const writer = { append: async () => ({ entry: "e", file: "decisions.md" as const, summary: "" }) } as never;
    const readOnly = createAgentBridge({
      entry: null,
      enabled: async () => true,
      knowledge: async () => "read-only",
      chats,
      writer,
      starts: { start: async () => ({ branch: "never" }) },
    });
    await expect(readOnly.call("c", "feature.start", { feature: "FEAT-4" })).rejects.toThrow(
      "Starting is off: this project's knowledge setting is read-only.",
    );
    const unwired = createAgentBridge({ entry: null, enabled: async () => true, chats, writer });
    await expect(unwired.call("c", "feature.start", { feature: "FEAT-4" })).rejects.toThrow(
      "Starting a feature isn't available.",
    );
    const off = createAgentBridge({ entry: null, enabled: async () => false, chats, writer });
    await expect(off.call("c", "feature.start", { feature: "FEAT-4" })).rejects.toThrow(
      "Featra MCP is off for this project.",
    );
  });
});
