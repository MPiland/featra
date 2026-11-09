/**
 * STORY-46: an agent's question as a card in the chat, and the sidebar's dot, through the real App. The host's server is
 * faked (chat-server.ts): it records the answer, and the test emits what the server tells the chat.
 */
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatEvent, Question } from "@featra/work-format";
import { CHAT_COPY } from "../../src/chats.ts";
import { renderApp } from "../harness.tsx";

afterEach(cleanup);

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
  ],
  multiSelect: true,
};
const composer = () => screen.getByRole("textbox", { name: CHAT_COPY.composer });
const log = () => screen.getByRole("log", { name: CHAT_COPY.transcript });
const card = () => within(log()).getByRole("form", { name: CHAT_COPY.question });
const set = (question: Question) => within(card()).getByRole("group", { name: new RegExp(question.question) });
const submit = () => within(card()).getByRole<HTMLButtonElement>("button", { name: CHAT_COPY.submit });
const other = (question: Question) => within(set(question)).getByRole("textbox", { name: CHAT_COPY.other });
const dot = () => screen.getByRole("region", { name: CHAT_COPY.chats }).querySelector(".chat-dot");

const call = (questions: Question[]): ChatEvent => ({
  type: "tool",
  id: "q1",
  name: "AskUserQuestion",
  input: { questions },
});
const ask = (questions: Question[]): ChatEvent => ({ type: "question", id: "q1", name: "AskUserQuestion", questions });

/** A Developer chat whose agent asks `questions`. */
async function asking(questions: Question[], opts: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp(opts);
  await app.user.click(screen.getByRole("button", { name: CHAT_COPY.newChat }));
  const dialog = await screen.findByRole("dialog", { name: CHAT_COPY.newChat });
  await app.user.click(await within(dialog).findByRole("button", { name: /^Developer/ }));
  await screen.findByRole("region", { name: "Developer" });
  await app.user.type(composer(), "ask me{Enter}");
  app.chats.emit("chat-1", call(questions), ask(questions));
  return app;
}

describe("AC1: an AskUserQuestion call shows as a card with each question, its options and Other", () => {
  it("shows each question with its header and options (a choice of one), and an Other field", async () => {
    await asking([COLOUR, FEATURES]);
    expect(within(set(COLOUR)).getByText(COLOUR.header)).toBeTruthy();
    const options = within(set(COLOUR)).getAllByRole("radio");
    expect(options.map((o) => o.closest("label")?.textContent)).toEqual(["BlueCalm", "RedLoud"]);
    expect(other(COLOUR).getAttribute("placeholder")).toBe(CHAT_COPY.other);
    expect(other(FEATURES)).toBeTruthy();
    expect(within(log()).queryByRole("group", { name: `${CHAT_COPY.approve} AskUserQuestion` })).toBeNull();
  });

  it("offers several options at once only where the agent allows it", async () => {
    await asking([COLOUR, FEATURES]);
    expect(within(set(COLOUR)).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(set(FEATURES)).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(set(FEATURES)).queryAllByRole("radio")).toHaveLength(0);
  });

  it("marks the card as waiting for an answer", async () => {
    await asking([COLOUR]);
    expect(within(log()).getByText(CHAT_COPY.needsAnswer)).toBeTruthy();
  });

  it("keeps Submit off until every question is answered", async () => {
    const { user } = await asking([COLOUR, FEATURES]);
    expect(submit().disabled).toBe(true);
    await user.click(within(set(COLOUR)).getByRole("radio", { name: /Blue/ }));
    expect(submit().disabled).toBe(true);
    await user.click(within(set(FEATURES)).getByRole("checkbox", { name: /Search/ }));
    expect(submit().disabled).toBe(false);
    await user.click(within(set(FEATURES)).getByRole("checkbox", { name: /Search/ }));
    expect(submit().disabled).toBe(true);
  });
});

describe("AC2: Submit sends the answers", () => {
  it("sends one answer for a choice of one, and each option ticked for several", async () => {
    const { user, calls } = await asking([COLOUR, FEATURES]);
    await user.click(within(set(COLOUR)).getByRole("radio", { name: /Blue/ }));
    await user.click(within(set(COLOUR)).getByRole("radio", { name: /Red/ }));
    await user.click(within(set(FEATURES)).getByRole("checkbox", { name: /Search/ }));
    await user.click(within(set(FEATURES)).getByRole("checkbox", { name: /Export/ }));
    await user.click(submit());
    expect(calls).toContain(
      `chat.answer:chat-1:q1:${JSON.stringify({ [COLOUR.question]: ["Red"], [FEATURES.question]: ["Search", "Export"] })}`,
    );
  });

  it("sends the user's own words for Other, instead of the option picked before, for a choice of one", async () => {
    const { user, calls } = await asking([COLOUR]);
    await user.click(within(set(COLOUR)).getByRole("radio", { name: /Blue/ }));
    await user.type(other(COLOUR), "  Green ");
    expect(within(set(COLOUR)).getByRole<HTMLInputElement>("radio", { name: /Blue/ }).checked).toBe(false);
    await user.click(submit());
    expect(calls).toContain(`chat.answer:chat-1:q1:${JSON.stringify({ [COLOUR.question]: ["Green"] })}`);
  });

  it("sends Other beside the options ticked, for several", async () => {
    const { user, calls } = await asking([FEATURES]);
    await user.click(within(set(FEATURES)).getByRole("checkbox", { name: /Search/ }));
    await user.type(other(FEATURES), "Print");
    await user.click(submit());
    expect(calls).toContain(`chat.answer:chat-1:q1:${JSON.stringify({ [FEATURES.question]: ["Search", "Print"] })}`);
  });

  it("answers from the keyboard: Enter in Other submits once the answers are complete, and not before", async () => {
    const { user, calls } = await asking([COLOUR]);
    await user.type(other(COLOUR), "{Enter}");
    expect(calls.filter((c) => c.startsWith("chat.answer"))).toEqual([]);
    await user.type(other(COLOUR), "Green{Enter}");
    expect(calls).toContain(`chat.answer:chat-1:q1:${JSON.stringify({ [COLOUR.question]: ["Green"] })}`);
  });

  it("shows why an answer wasn't taken, and keeps the card to answer again", async () => {
    const { user } = await asking([COLOUR], { answerError: "This request isn't waiting for an answer." });
    await user.click(within(set(COLOUR)).getByRole("radio", { name: /Blue/ }));
    await user.click(submit());
    expect((await within(log()).findByRole("alert")).textContent).toBe("This request isn't waiting for an answer.");
    expect(submit().disabled).toBe(false);
  });
});

describe("AC3: an answered card collapses to the chosen answers", () => {
  it("shows each question with what was chosen, and no choices left", async () => {
    const { chats } = await asking([COLOUR, FEATURES]);
    chats.emit("chat-1", {
      type: "question-answered",
      id: "q1",
      answers: { [COLOUR.question]: ["Blue"], [FEATURES.question]: ["Search", "Print"] },
    });
    expect(within(log()).queryByRole("form")).toBeNull();
    expect(within(log()).queryAllByRole("radio")).toHaveLength(0);
    const answers = within(log()).getByText(COLOUR.question).closest("dl")!;
    expect(answers.textContent).toBe(`${COLOUR.question}Blue${FEATURES.question}Search, Print`);
    expect(within(log()).getByText(CHAT_COPY.answered)).toBeTruthy();
  });

  it("shows a question the turn ended on as an ordinary row, marked stopped", async () => {
    const { chats } = await asking([COLOUR]);
    chats.emit("chat-1", { type: "turn-end", outcome: "stopped" });
    expect(within(log()).queryByRole("form")).toBeNull();
    expect(within(log()).getByRole("button", { name: /^AskUserQuestion/ }).textContent).toBe(
      `AskUserQuestion${COLOUR.question}${CHAT_COPY.toolStopped}`,
    );
  });
});

describe("AC4: a chat waiting on a question shows the STORY-21 dot", () => {
  it("shows the dot while the question waits, and clears it once answered", async () => {
    const { chats } = await asking([COLOUR]);
    expect(dot()?.getAttribute("data-waiting")).toBe("question");
    expect(dot()?.textContent).toBe(CHAT_COPY.waiting);
    chats.emit("chat-1", { type: "question-answered", id: "q1", answers: { [COLOUR.question]: ["Blue"] } });
    expect(dot()).toBeNull();
  });
});
