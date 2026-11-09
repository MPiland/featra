/**
 * STORY-46: agent questions as cards, through the real session manager, Claude adapter and approval desk. Only the SDK's
 * `query` (and the `canUseTool` calls it makes) and the `claude` lookup are fake.
 */
import { afterEach, describe, expect, it } from "vitest";
import { APPROVAL_CANCELLED, CHAT_MESSAGES, type ChatEvent, type Question } from "@featra/work-format";
import { chat, closeChats, DIR } from "./chat-fixture.ts";
import { sdk } from "./fake-query.ts";
import { until } from "./until.ts";

afterEach(closeChats);

const COLOUR: Question = {
  question: "Which colour do you prefer?",
  header: "Colour",
  options: [
    { label: "Blue", description: "Calm" },
    { label: "Red", description: "Loud" },
  ],
  multiSelect: false,
};
const FEATURES: Question = {
  question: "Which features?",
  header: "Features",
  options: [
    { label: "Search", description: "Find things" },
    { label: "Export", description: "Get data out" },
    { label: "Sync", description: "Keep devices alike" },
  ],
  multiSelect: true,
};
const ASK = "AskUserQuestion";
const CANCELLED = { behavior: "deny", message: APPROVAL_CANCELLED, interrupt: true };
const of = (events: ChatEvent[], type: ChatEvent["type"]) => events.filter((e) => e.type === type);

/** A chat whose agent has just called AskUserQuestion with `questions`. */
async function asking(questions: Question[] = [COLOUR], id = "q1") {
  const c = await chat();
  c.send("ask me");
  const run = await c.run();
  const input = { questions };
  run.say(sdk.init(), sdk.assistant("m1", [sdk.toolUse(id, ASK, input)]));
  await until(() => c.events.some((e) => e.type === "tool"));
  return { c, run, input };
}

const row = (c: Awaited<ReturnType<typeof chat>>) => c.manager.list(DIR)[0]!;
const tool = (c: Awaited<ReturnType<typeof chat>>, id = "q1") =>
  c.view().items.find((i) => i.kind === "tool" && i.id === id);

describe("AC1: AskUserQuestion shows as a card with each question and its options", () => {
  it("tells the chat the questions, with their options and whether several may be chosen, and holds canUseTool", async () => {
    const { c, run, input } = await asking([COLOUR, FEATURES]);
    let done = false;
    const asked = run.ask(ASK, input, "q1").then((r) => ((done = true), r));
    await until(() => of(c.events, "question").length === 1);
    expect(of(c.events, "question")).toEqual([
      { type: "question", id: "q1", name: ASK, questions: [COLOUR, FEATURES] },
    ]);
    expect(of(c.events, "approval")).toEqual([]);
    expect(tool(c)).toMatchObject({ name: ASK, approval: null, question: { status: "pending" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
    c.manager.answer(c.id, "q1", { [COLOUR.question]: ["Red"], [FEATURES.question]: ["Search"] });
    await asked;
  });

  it("shows up to four questions in one call", async () => {
    const four = ["One?", "Two?", "Three?", "Four?"].map((question): Question => ({
      question,
      header: "",
      options: COLOUR.options,
      multiSelect: false,
    }));
    const { c, run, input } = await asking(four);
    const asked = run.ask(ASK, input, "q1");
    await until(() => of(c.events, "question").length === 1);
    expect((of(c.events, "question")[0] as { questions: Question[] }).questions.map((q) => q.question)).toEqual([
      "One?",
      "Two?",
      "Three?",
      "Four?",
    ]);
    c.manager.answer(c.id, "q1", Object.fromEntries(four.map((q) => [q.question, ["Blue"]])));
    expect(await asked).toMatchObject({ behavior: "allow" });
  });

  it("asks about a call whose questions it can't show as an ordinary approval", async () => {
    const { c, run } = await asking();
    void run.ask(ASK, { questions: [] }, "q1");
    await until(() => of(c.events, "approval").length === 1);
    expect(of(c.events, "question")).toEqual([]);
    expect(row(c).waiting).toBe("approval");
  });
});

describe("AC2: the answers go back as the tool's result and the agent continues the same turn", () => {
  it("allows the call with the answers added to its input, keyed by each question's text", async () => {
    const { c, run, input } = await asking([COLOUR, FEATURES]);
    const asked = run.ask(ASK, input, "q1");
    await until(() => of(c.events, "question").length === 1);
    c.manager.answer(c.id, "q1", { [COLOUR.question]: ["Blue"], [FEATURES.question]: ["Search", "Sync"] });
    expect(await asked).toEqual({
      behavior: "allow",
      updatedInput: { ...input, answers: { [COLOUR.question]: "Blue", [FEATURES.question]: "Search, Sync" } },
    });
    expect(of(c.events, "question-answered")).toEqual([
      {
        type: "question-answered",
        id: "q1",
        answers: { [COLOUR.question]: ["Blue"], [FEATURES.question]: ["Search", "Sync"] },
      },
    ]);
  });

  it("sends the user's own words (Other) as the answer", async () => {
    const { c, run, input } = await asking();
    const asked = run.ask(ASK, input, "q1");
    await until(() => of(c.events, "question").length === 1);
    c.manager.answer(c.id, "q1", { [COLOUR.question]: ["  Green, like moss "] });
    expect(await asked).toMatchObject({ updatedInput: { answers: { [COLOUR.question]: "Green, like moss" } } });
  });

  it("goes on in the same turn: the agent's result and reply follow, with no new message", async () => {
    const { c, run, input } = await asking();
    const asked = run.ask(ASK, input, "q1");
    await until(() => of(c.events, "question").length === 1);
    c.manager.answer(c.id, "q1", { [COLOUR.question]: ["Blue"] });
    await asked;
    run.say(
      sdk.toolResult("q1", `"${COLOUR.question}"="Blue"`),
      sdk.assistant("m2", [sdk.text("Blue it is.")]),
      sdk.success("Blue it is."),
    );
    await until(() => of(c.events, "turn-end").length === 1);
    expect(run.heard).toEqual(["ask me"]);
    expect(of(c.events, "user")).toHaveLength(1);
    expect(tool(c)).toMatchObject({ question: { status: "answered" }, result: { isError: false } });
    expect(c.view().running).toBe(false);
  });

  it("refuses answers that don't answer each question as it asks, and the question keeps waiting", async () => {
    const { c, run, input } = await asking([COLOUR, FEATURES]);
    const asked = run.ask(ASK, input, "q1");
    await until(() => of(c.events, "question").length === 1);
    const bad = (answers: Record<string, string[]>) =>
      expect(() => c.manager.answer(c.id, "q1", answers)).toThrow(CHAT_MESSAGES.badAnswer);
    bad({});
    bad({ [COLOUR.question]: ["Blue"] });
    bad({ [COLOUR.question]: ["Blue", "Red"], [FEATURES.question]: ["Search"] });
    bad({ [COLOUR.question]: ["Blue"], [FEATURES.question]: [] });
    expect(of(c.events, "question-answered")).toEqual([]);
    expect(row(c).waiting).toBe("question");
    c.manager.answer(c.id, "q1", { [COLOUR.question]: ["Blue"], [FEATURES.question]: ["Export"] });
    expect(await asked).toMatchObject({ behavior: "allow" });
  });

  it("refuses an answer to a question that isn't waiting, a second answer, and an approval answered as a question", async () => {
    const { c, run, input } = await asking();
    const answers = { [COLOUR.question]: ["Blue"] };
    expect(() => c.manager.answer(c.id, "q1", answers)).toThrow(CHAT_MESSAGES.noRequest);
    const asked = run.ask(ASK, input, "q1");
    await until(() => of(c.events, "question").length === 1);
    expect(() => c.manager.approve(c.id, "q1", { choice: "allow" })).toThrow(CHAT_MESSAGES.noRequest);
    c.manager.answer(c.id, "q1", answers);
    expect(() => c.manager.answer(c.id, "q1", answers)).toThrow(CHAT_MESSAGES.noRequest);
    await asked;
    void run.ask("Bash", { command: "ls" }, "t1");
    await until(() => of(c.events, "approval").length === 1);
    expect(() => c.manager.answer(c.id, "t1", answers)).toThrow(CHAT_MESSAGES.noRequest);
  });

  it("holds two questions at once, each answered on its own", async () => {
    const { c, run, input } = await asking();
    run.say(sdk.assistant("m2", [sdk.toolUse("q2", ASK, { questions: [FEATURES] })]));
    const first = run.ask(ASK, input, "q1");
    const second = run.ask(ASK, { questions: [FEATURES] }, "q2");
    await until(() => of(c.events, "question").length === 2);
    c.manager.answer(c.id, "q2", { [FEATURES.question]: ["Export"] });
    expect(await second).toMatchObject({ updatedInput: { answers: { [FEATURES.question]: "Export" } } });
    expect(row(c).waiting).toBe("question");
    c.manager.answer(c.id, "q1", { [COLOUR.question]: ["Red"] });
    expect(await first).toMatchObject({ updatedInput: { answers: { [COLOUR.question]: "Red" } } });
    expect(row(c).waiting).toBeNull();
  });

  it("ends the first of the same question asked again, and takes the answer on the second", async () => {
    const { c, run, input } = await asking();
    const first = run.ask(ASK, input, "q1");
    await until(() => of(c.events, "question").length === 1);
    const second = run.ask(ASK, input, "q1");
    expect(await first).toEqual({ behavior: "deny", message: APPROVAL_CANCELLED });
    await until(() => of(c.events, "question").length === 2);
    c.manager.answer(c.id, "q1", { [COLOUR.question]: ["Blue"] });
    expect(await second).toMatchObject({ behavior: "allow" });
  });
});

describe("AC3: an answered card collapses to the chosen answers", () => {
  it("keeps what was chosen for each question on the call's row", async () => {
    const { c, run, input } = await asking([COLOUR, FEATURES]);
    const asked = run.ask(ASK, input, "q1");
    await until(() => of(c.events, "question").length === 1);
    c.manager.answer(c.id, "q1", { [COLOUR.question]: ["Blue"], [FEATURES.question]: ["Search", "Export"] });
    await asked;
    expect(tool(c)).toMatchObject({
      question: {
        status: "answered",
        answers: { [COLOUR.question]: ["Blue"], [FEATURES.question]: ["Search", "Export"] },
      },
    });
  });
});

describe("AC4: a chat waiting on a question is marked waiting", () => {
  it("marks the row waiting on a question until it is answered, then the agent's turn goes on", async () => {
    const { c, run, input } = await asking();
    expect(row(c).waiting).toBeNull();
    const asked = run.ask(ASK, input, "q1");
    await until(() => row(c).waiting === "question");
    expect(row(c)).toMatchObject({ running: true, waiting: "question" });
    c.manager.answer(c.id, "q1", { [COLOUR.question]: ["Blue"] });
    await asked;
    expect(row(c)).toMatchObject({ running: true, waiting: null });
    run.say(sdk.success());
    await until(() => row(c).waiting === "reply");
  });

  it("drives the chat list's dot, the list's own watchers hear it", async () => {
    const { c, run, input } = await asking();
    const seen: (string | null)[] = [];
    c.manager.watchList(DIR, (chats) => seen.push(chats[0]?.waiting ?? null));
    const asked = run.ask(ASK, input, "q1");
    await until(() => seen.includes("question"));
    c.manager.answer(c.id, "q1", { [COLOUR.question]: ["Blue"] });
    await asked;
    await until(() => seen.at(-1) === null);
    expect(seen).toContain("question");
  });
});

describe("a question the user never answers", () => {
  it("is cancelled by Stop: the agent is told to stop, the row shows stopped, nothing waits", async () => {
    const { c, run, input } = await asking();
    const asked = run.ask(ASK, input, "q1");
    await until(() => of(c.events, "question").length === 1);
    await c.manager.stop(c.id);
    expect(await asked).toEqual(CANCELLED);
    expect(of(c.events, "approval-cancelled")).toEqual([{ type: "approval-cancelled", id: "q1" }]);
    run.say(sdk.failure());
    await until(() => of(c.events, "turn-end").length === 1);
    expect(tool(c)).toMatchObject({ question: null, stopped: true });
    expect(row(c).waiting).toBeNull();
    expect(() => c.manager.answer(c.id, "q1", { [COLOUR.question]: ["Blue"] })).toThrow(CHAT_MESSAGES.noRequest);
  });

  it("is ended quietly, with the agent told to stop, when the chat closes", async () => {
    const { c, run, input } = await asking();
    const asked = run.ask(ASK, input, "q1");
    await until(() => of(c.events, "question").length === 1);
    c.manager.closeProjects(() => false);
    expect(await asked).toEqual(CANCELLED);
    expect(of(c.events, "approval-cancelled")).toEqual([]);
  });

  it("is cancelled when the SDK cancels it with its own signal, and the row shows cancelled", async () => {
    const { c, run, input } = await asking();
    const sdkSignal = new AbortController();
    const asked = run.ask(ASK, input, "q1", { signal: sdkSignal.signal });
    await until(() => of(c.events, "question").length === 1);
    sdkSignal.abort();
    expect(await asked).toEqual(CANCELLED);
    run.say(sdk.success());
    await until(() => of(c.events, "turn-end").length === 1);
    expect(tool(c)).toMatchObject({ question: null, cancelled: true, stopped: false });
  });

  it("is not asked at all once the turn was stopped", async () => {
    const { c, run, input } = await asking();
    await c.manager.stop(c.id);
    expect(await run.ask(ASK, input, "q1")).toEqual(CANCELLED);
    expect(of(c.events, "question")).toEqual([]);
  });

  it("ends when the agent fails, and the next message starts with nothing waiting", async () => {
    const { c, run, input } = await asking();
    void run.ask(ASK, input, "q1");
    await until(() => of(c.events, "question").length === 1);
    run.crash(new Error("boom"));
    await until(() => of(c.events, "turn-end").length === 1);
    expect(row(c).waiting).toBe("reply");
    expect(tool(c)).toMatchObject({ question: null });
  });
});
