/** STORY-46: agent questions: the shape and its checks, the events, the fold, and the waiting dot. */
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_ROLES,
  chatAnswerParams,
  foldChat,
  idleSummary,
  newSummary,
  normalizeChatEvent,
  normalizeQuestions,
  reduceRow,
  SERVER_METHODS,
  toolSummary,
  validAnswers,
  WAIT_REASONS,
  type ChatEvent,
  type ChatRow,
  type Question,
} from "../src/index.ts";

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
    { label: "Search", description: "" },
    { label: "Export", description: "" },
  ],
  multiSelect: true,
};
const DEVELOPER = BUILT_IN_ROLES.find((r) => r.id === "developer")!;
const START: ChatRow = { summary: newSummary("c1", "claude", DEVELOPER, "2026-11-09T10:00:00.000Z"), asks: [] };
const rows = (events: ChatEvent[]) => events.reduce(reduceRow, START);

const user: ChatEvent = { type: "user", text: "ask me" };
const call = (id = "q1"): ChatEvent => ({ type: "tool", id, name: "AskUserQuestion", input: { questions: [COLOUR] } });
const ask = (id = "q1", questions = [COLOUR]): ChatEvent => ({
  type: "question",
  id,
  name: "AskUserQuestion",
  questions,
});
const answered = (id = "q1", answers = { [COLOUR.question]: ["Blue"] }): ChatEvent => ({
  type: "question-answered",
  id,
  answers,
});
const approval = (id: string): ChatEvent => ({ type: "approval", id, name: "Bash", input: {}, forChat: true });
const turn = (outcome: "done" | "stopped"): ChatEvent => ({ type: "turn-end", outcome });
const toolOf = (events: ChatEvent[], id = "q1") => foldChat(events).items.find((i) => i.kind === "tool" && i.id === id);

describe("AC1: the questions the agent asks", () => {
  it("reads each question with its options and whether several may be chosen", () => {
    expect(normalizeQuestions([COLOUR, FEATURES])).toEqual([COLOUR, FEATURES]);
  });

  it("defaults a missing header or description to empty, and a missing multiSelect to a single choice", () => {
    expect(normalizeQuestions([{ question: "Pick?", options: [{ label: "A" }, { label: "B" }] }])).toEqual([
      {
        question: "Pick?",
        header: "",
        options: [
          { label: "A", description: "" },
          { label: "B", description: "" },
        ],
        multiSelect: false,
      },
    ]);
  });

  it("refuses what the card can't show: no questions, a blank question, no options, a blank label, shared text", () => {
    expect(normalizeQuestions(undefined)).toBeNull();
    expect(normalizeQuestions([])).toBeNull();
    expect(normalizeQuestions([{ ...COLOUR, question: " " }])).toBeNull();
    expect(normalizeQuestions([{ ...COLOUR, options: [] }])).toBeNull();
    expect(normalizeQuestions([{ ...COLOUR, options: [{ label: "", description: "x" }] }])).toBeNull();
    expect(normalizeQuestions([COLOUR, COLOUR])).toBeNull();
    expect(normalizeQuestions([COLOUR, "nope"])).toBeNull();
  });

  it("reads a question event, and drops one with no usable questions", () => {
    expect(normalizeChatEvent(ask("q1", [COLOUR, FEATURES]))).toEqual(ask("q1", [COLOUR, FEATURES]));
    expect(normalizeChatEvent({ type: "question", id: "q1", name: "AskUserQuestion", questions: [] })).toBeNull();
    expect(normalizeChatEvent({ type: "question", id: "", name: "AskUserQuestion", questions: [COLOUR] })).toBeNull();
  });

  it("shows the first question as the call's summary", () => {
    expect(toolSummary("AskUserQuestion", { questions: [COLOUR, FEATURES] })).toBe(COLOUR.question);
    expect(toolSummary("AskUserQuestion", {})).toBe("");
  });
});

describe("AC2: the answers sent back", () => {
  it("takes one answer for a single choice and one or more for several, each trimmed", () => {
    expect(
      validAnswers([COLOUR, FEATURES], { [COLOUR.question]: [" Blue "], [FEATURES.question]: ["Search", "Export"] }),
    ).toEqual({ [COLOUR.question]: ["Blue"], [FEATURES.question]: ["Search", "Export"] });
  });

  it("takes the user's own words (Other) as the answer", () => {
    expect(validAnswers([COLOUR], { [COLOUR.question]: ["Green, like moss"] })).toEqual({
      [COLOUR.question]: ["Green, like moss"],
    });
  });

  it("refuses a question left unanswered, blank, or a single choice answered twice", () => {
    expect(validAnswers([COLOUR], {})).toBeNull();
    expect(validAnswers([COLOUR], { [COLOUR.question]: ["  "] })).toBeNull();
    expect(validAnswers([COLOUR], { [COLOUR.question]: ["Blue", "Red"] })).toBeNull();
    expect(validAnswers([COLOUR, FEATURES], { [COLOUR.question]: ["Blue"] })).toBeNull();
    expect(validAnswers([FEATURES], { [FEATURES.question]: [] })).toBeNull();
  });

  it("drops answers to questions that weren't asked", () => {
    expect(validAnswers([COLOUR], { [COLOUR.question]: ["Blue"], "Why?": ["x"] })).toEqual({
      [COLOUR.question]: ["Blue"],
    });
  });

  it("reads chat.answer's params, or null when they aren't { id, tool, answers }", () => {
    const answers = { [COLOUR.question]: ["Blue"] };
    expect(chatAnswerParams({ id: "c1", tool: "q1", answers })).toEqual({ id: "c1", tool: "q1", answers });
    expect(chatAnswerParams({ id: "c1", tool: "q1" })).toBeNull();
    expect(chatAnswerParams({ id: "c1", tool: "", answers })).toBeNull();
    expect(chatAnswerParams({ id: "c1", tool: "q1", answers: { q: "Blue" } })).toBeNull();
    expect(chatAnswerParams({ id: "c1", tool: "q1", answers: { q: [1] } })).toBeNull();
    expect(chatAnswerParams("nope")).toBeNull();
  });

  it("is a server method", () => {
    expect(SERVER_METHODS).toContain("chat.answer");
  });

  it("reads an answered event, dropping answers that aren't lists of text", () => {
    expect(normalizeChatEvent({ type: "question-answered", id: "q1", answers: { a: ["x", 1], b: "y" } })).toEqual({
      type: "question-answered",
      id: "q1",
      answers: { a: ["x"] },
    });
    expect(normalizeChatEvent({ type: "question-answered", id: "q1" })).toBeNull();
  });
});

describe("AC1, AC3: the card on the call's row, collapsed to the chosen answers", () => {
  it("shows a waiting question on the call's row, whichever of the two events comes first", () => {
    const expected = { name: "AskUserQuestion", question: { status: "pending", questions: [COLOUR] } };
    expect(toolOf([user, call(), ask()])).toMatchObject(expected);
    expect(toolOf([user, ask(), call()])).toMatchObject(expected);
    expect(foldChat([user, call(), ask()]).items.filter((i) => i.kind === "tool")).toHaveLength(1);
  });

  it("collapses to the answers once answered, and keeps them with each question", () => {
    const both = { [COLOUR.question]: ["Blue"], [FEATURES.question]: ["Search", "Export"] };
    expect(toolOf([user, call(), ask("q1", [COLOUR, FEATURES]), answered("q1", both)])).toMatchObject({
      question: { status: "answered", questions: [COLOUR, FEATURES], answers: both },
    });
  });

  it("keeps the answer when the call's result follows it", () => {
    const result: ChatEvent = { type: "tool-result", id: "q1", output: '"Which colour"="Blue"', isError: false };
    expect(toolOf([user, call(), ask(), answered(), result])).toMatchObject({
      question: { status: "answered" },
      result: { isError: false },
    });
  });

  it("ignores an answer for a call that has no question", () => {
    expect(foldChat([user, answered()]).items).toHaveLength(1);
  });

  it("ends a cancelled question as cancelled, with nothing left to answer", () => {
    expect(toolOf([user, call(), ask(), { type: "approval-cancelled", id: "q1" }])).toMatchObject({
      question: null,
      cancelled: true,
    });
  });

  it("keeps an answered question when a cancel arrives late", () => {
    expect(toolOf([user, call(), ask(), answered(), { type: "approval-cancelled", id: "q1" }])).toMatchObject({
      question: { status: "answered" },
      cancelled: false,
    });
  });

  it("marks a question the turn's Stop left waiting stopped, and one a turn ended otherwise cancelled", () => {
    expect(toolOf([user, call(), ask(), turn("stopped")])).toMatchObject({ question: null, stopped: true });
    expect(toolOf([user, call(), ask(), turn("done")])).toMatchObject({ question: null, cancelled: true });
  });
});

describe("AC4: a chat waiting on a question is marked waiting", () => {
  it("is a wait reason", () => {
    expect(WAIT_REASONS).toContain("question");
  });

  it("waits while a question is open, and stops waiting once it is answered or cancelled", () => {
    expect(rows([user, call(), ask()]).summary).toMatchObject({ waiting: "question", running: true });
    expect(rows([user, call(), ask(), answered()]).summary.waiting).toBeNull();
    expect(rows([user, call(), ask(), { type: "approval-cancelled", id: "q1" }]).summary.waiting).toBeNull();
  });

  it("waits until every question the call asked is answered, and the oldest request sets the reason", () => {
    expect(rows([user, ask("q1"), ask("q2"), answered("q1")]).summary.waiting).toBe("question");
    expect(rows([user, ask("q1"), ask("q2"), answered("q1"), answered("q2")]).summary.waiting).toBeNull();
    expect(rows([user, approval("t1"), ask("q1")]).summary.waiting).toBe("approval");
    expect(
      rows([
        user,
        approval("t1"),
        ask("q1"),
        { type: "tool-allowed", id: "t1", name: "Bash", input: {}, scope: "once" },
      ]).summary.waiting,
    ).toBe("question");
  });

  it("waits on a reply once the turn ends, and a restored row never waits on a question", () => {
    expect(rows([user, ask(), turn("done")]).summary.waiting).toBe("reply");
    expect(rows([user, ask(), turn("stopped")]).summary.waiting).toBeNull();
    expect(idleSummary(rows([user, ask()]).summary).waiting).toBe("reply");
  });
});
