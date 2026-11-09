/**
 * STORY-46: `chat.answer` over the real socket and the real services (ADR 0018). Only the Agent SDK's `query` (and its
 * `canUseTool` calls) and the PATH lookup are fake.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHAT_MESSAGES, type ChatEvent, type Question } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { tempFolder } from "./temp-folder.ts";
import { until } from "./until.ts";
import { openFrames } from "./ws-frames.ts";

const TOKEN = "test-token-0123456789";
const COLOUR: Question = {
  question: "Which colour do you prefer?",
  header: "Colour",
  options: [
    { label: "Blue", description: "Calm" },
    { label: "Red", description: "Loud" },
  ],
  multiSelect: false,
};
const allowed = createAllowedProjects();
const claude = fakeClaude("/usr/local/bin/claude");
const services = createServices({ allowed, log: () => {}, claude: claude.deps });
let server: RunningServer;
let project: { dir: string; dispose: () => Promise<void> };
const open = () => openFrames<ChatEvent>(`${server.url}?token=${TOKEN}`);

beforeAll(async () => {
  project = await tempFolder();
  allowed.set([project.dir]);
  server = await startServer({ token: TOKEN, api: services.api, log: () => {} });
});

afterAll(async () => {
  await server.close();
  await services.close();
  await project.dispose();
});

describe("STORY-46: chat.answer", () => {
  it("pushes the question to a watcher, takes the answers, and refuses what isn't asked or isn't answered", async () => {
    const socket = await open();
    try {
      socket.send({ id: 1, method: "chat.start", params: { dir: project.dir, role: "developer" } });
      const { id } = (await socket.next((f) => f.id === 1)).result as { id: string };
      socket.send({ id: 2, method: "chat.watch", params: { id } });
      await socket.next((f) => f.id === 2);
      socket.send({ id: 3, method: "chat.send", params: { id, text: "ask me" } });
      await socket.next((f) => f.id === 3);
      await until(() => claude.runs[0]?.heard.length === 1);
      const run = claude.runs[0]!;
      const input = { questions: [COLOUR] };
      run.say(sdk.init(), sdk.assistant("m1", [sdk.toolUse("q1", "AskUserQuestion", input)]));
      await socket.next((f) => f.data?.type === "tool");
      const asked = run.ask("AskUserQuestion", input, "q1");
      expect((await socket.next((f) => f.data?.type === "question")).data).toEqual({
        type: "question",
        id: "q1",
        name: "AskUserQuestion",
        questions: [COLOUR],
      });

      const answers = { [COLOUR.question]: ["Blue"] };
      socket.send({ id: 4, method: "chat.answer", params: { id, tool: "q1", answers: { q: "Blue" } } });
      expect(await socket.next((f) => f.id === 4)).toMatchObject({
        ok: false,
        error: "Expected { id, tool, answers }.",
      });
      socket.send({ id: 5, method: "chat.answer", params: { id, tool: "q9", answers } });
      expect(await socket.next((f) => f.id === 5)).toEqual({ id: 5, ok: false, error: CHAT_MESSAGES.noRequest });
      socket.send({ id: 6, method: "chat.answer", params: { id: "nope", tool: "q1", answers } });
      expect(await socket.next((f) => f.id === 6)).toEqual({ id: 6, ok: false, error: CHAT_MESSAGES.noChat });
      socket.send({ id: 7, method: "chat.answer", params: { id, tool: "q1", answers: {} } });
      expect(await socket.next((f) => f.id === 7)).toEqual({ id: 7, ok: false, error: CHAT_MESSAGES.badAnswer });

      socket.send({ id: 8, method: "chat.answer", params: { id, tool: "q1", answers } });
      expect(await socket.next((f) => f.id === 8)).toEqual({ id: 8, ok: true, result: null });
      expect(await asked).toEqual({
        behavior: "allow",
        updatedInput: { ...input, answers: { [COLOUR.question]: "Blue" } },
      });
      expect((await socket.next((f) => f.data?.type === "question-answered")).data).toEqual({
        type: "question-answered",
        id: "q1",
        answers,
      });
    } finally {
      socket.close();
    }
  });
});
