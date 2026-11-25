/**
 * STORY-25 AC1: when a Dev Lead's chat shapes the project's first feature, it asks once how stories show they work; the
 * answer is the project's proof, which Settings > Project shows and changes. The real services, sockets, chat manager,
 * draft writer and config writer on a real repository; only the Agent SDK is faked.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENT_PATH, PROOF_QUESTION, type ChatEvent } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { fakeClaude } from "./fake-query.ts";
import { until } from "./until.ts";
import { openFrames, type FrameSocket } from "./ws-frames.ts";

const TOKEN = "test-token-0123456789";
const allowed = createAllowedProjects();
const services = createServices({
  allowed,
  log: () => {},
  claude: fakeClaude().deps,
  mcpEntry: fileURLToPath(import.meta.url),
});
let server: RunningServer;
let repo: CardRepo;
/** A project adopting Featra: it finished a feature before Featra shaped one. */
let other: CardRepo;
let window: FrameSocket<ChatEvent>;
let n = 1;

async function ask(socket: FrameSocket<unknown>, method: string, params: unknown) {
  const id = n++;
  socket.send({ id, method, params });
  return socket.next((f) => f.id === id);
}

/** A Dev Lead chat, its events as the window watches them, and its agent socket. */
async function lead() {
  const id = ((await ask(window, "chat.start", { dir: repo.main, role: "dev-lead" })).result as { id: string }).id;
  const watch = n;
  await ask(window, "chat.watch", { id });
  const events = () =>
    window.frames.filter((f) => f.event === "chat.event" && f.watch === watch).map((f) => f.data as ChatEvent);
  const secret = (await services.agents.attach({ id, dir: repo.main }))?.env.FEATRA_AGENT_TOKEN ?? "";
  const agent = await openFrames(`ws://127.0.0.1:${server.port}${AGENT_PATH}?token=${encodeURIComponent(secret)}`);
  return { id, events, agent };
}

const draft = (agent: FrameSocket<unknown>, title: string) =>
  ask(agent, "cards.draft", {
    feature: { title, description: `Shape ${title}.` },
    stories: [
      { id: null, title: `Build ${title}`, story: "As a builder, I build.", criteria: ["It works"], tasks: [] },
    ],
  });

const questions = (events: ChatEvent[]) => events.filter((e) => e.type === "question");
const config = () => readFile(join(repo.main, ".featra", "config.yaml"), "utf8");

beforeAll(async () => {
  repo = await cardRepo();
  other = await cardRepo("adopting");
  allowed.set([repo.main, other.main]);
  server = await startServer({ token: TOKEN, api: services.api, agents: services.agents, log: () => {} });
  services.agents.setPort(server.port);
  window = await openFrames<ChatEvent>(`${server.url}?token=${TOKEN}`);
});
afterAll(async () => {
  window.close();
  await server.close();
  await services.close();
  await repo.dispose();
  await other.dispose();
});

describe("AC1: no proof question in a project that had a feature before", () => {
  it("isn't asked when the feature shaped isn't the project's first; Settings chooses its proof", async () => {
    await other.write(other.main, card("FEAT-1", "feature", null, "done"));
    other.commit(other.main, "plan");
    const id = ((await ask(window, "chat.start", { dir: other.main, role: "dev-lead" })).result as { id: string }).id;
    const watch = n;
    await ask(window, "chat.watch", { id });
    const secret = (await services.agents.attach({ id, dir: other.main }))?.env.FEATRA_AGENT_TOKEN ?? "";
    const agent = await openFrames(`ws://127.0.0.1:${server.port}${AGENT_PATH}?token=${encodeURIComponent(secret)}`);
    expect(await draft(agent, "Second")).toMatchObject({
      ok: true,
      result: expect.objectContaining({ feature: "FEAT-2" }),
    });
    const events = window.frames.filter((f) => f.event === "chat.event" && f.watch === watch).map((f) => f.data);
    expect(questions(events as ChatEvent[])).toHaveLength(0);
  });
});

describe("AC1: the proof question", () => {
  let first: Awaited<ReturnType<typeof lead>>;

  it("is asked on the question card when the project's first feature is shaped, by the app", async () => {
    first = await lead();
    expect(await draft(first.agent, "Shaping")).toMatchObject({ ok: true });
    await until(() => questions(first.events()).length === 1);
    expect(questions(first.events())[0]).toMatchObject({
      type: "question",
      name: "proof",
      subject: "proof",
      questions: [PROOF_QUESTION],
    });
    expect(PROOF_QUESTION.options.map((o) => o.label)).toEqual(["Screenshots", "Preview", "Both", "Neither"]);
  });

  it("isn't asked again while it waits, though the feature is shaped again", async () => {
    expect(await draft(first.agent, "Shaping")).toMatchObject({ ok: true });
    expect(questions(first.events())).toHaveLength(1);
  });

  it("is answered on the card, and the answer is the project's proof, shown in Settings", async () => {
    const asked = questions(first.events())[0]!;
    const answered = await ask(window, "chat.answer", {
      id: first.id,
      tool: asked.id,
      answers: { [PROOF_QUESTION.question]: ["Both"] },
    });
    expect(answered).toMatchObject({ ok: true });
    await until(async () => /^proof: both$/m.test(await config().catch(() => "")));
    expect(await ask(window, "proof.load", { dir: repo.main })).toMatchObject({ ok: true, result: { proof: "both" } });
  });

  it("isn't asked again once the project has a proof, for the next feature or another chat", async () => {
    const second = await lead();
    expect(await draft(second.agent, "Another")).toMatchObject({ ok: true });
    expect(await draft(first.agent, "Shaping")).toMatchObject({ ok: true });
    expect(questions(second.events())).toHaveLength(0);
    expect(questions(first.events())).toHaveLength(1);
  });

  it("is changed in Settings, and not asked again for a later feature once cleared there", async () => {
    expect(await ask(window, "proof.set", { dir: repo.main, patch: { proof: "preview" } })).toMatchObject({
      ok: true,
      result: { proof: "preview", error: null },
    });
    expect(await config()).toMatch(/^proof: preview$/m);
    expect(await ask(window, "proof.set", { dir: repo.main, patch: { proof: null } })).toMatchObject({
      ok: true,
      result: { proof: null },
    });
    const third = await lead();
    expect(await draft(third.agent, "Third")).toMatchObject({ ok: true });
    expect(questions(third.events())).toHaveLength(0);
  });
});
