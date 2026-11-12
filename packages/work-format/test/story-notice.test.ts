/** STORY-54: the pure rules of notices and `message_session`: summaries, batching text, input and refusals. */
import { describe, expect, it } from "vitest";
import {
  askedSummary,
  ASKS_SUMMARY_MAX,
  leadMessage,
  lastMessage,
  MESSAGE_MESSAGES,
  messageRefusal,
  NOTICE_ASKS_HINT,
  NOTICE_LABEL,
  NOTICE_SUMMARY_MAX,
  noticeMessage,
  oneLine,
  outcomeOf,
  parseMessageInput,
  questionSummary,
  startedStory,
  stoppedStory,
  turnSummary,
  userAnswerMessage,
  type ChatEvent,
} from "../src/index.ts";
import { at, story } from "./fixtures.ts";

const started = startedStory(
  story("STORY-54", "FEAT-5", { status: "Ready" }),
  { agent: "claude", role: "developer", model: "m", reasoning: "high", session: "chat-1", branch: "featra/story-54" },
  "user",
  at(1),
);
const idle = { running: false, queued: false, lead: "lead-1" };
const opt = (label: string) => ({ label, description: "" });
const q = (question: string) => ({ question, header: "h", options: [], multiSelect: false });
const text = (block: string, delta: string): ChatEvent => ({ type: "text", block, delta });

describe("parseMessageInput", () => {
  it("takes a story id in any case and trimmed text", () => {
    expect(parseMessageInput({ story: " story-9 ", text: " Go on. " })).toEqual({
      ok: true,
      value: { story: "STORY-9", text: "Go on." },
    });
  });

  it("refuses anything that is not a story id or has no text", () => {
    expect(parseMessageInput({ story: "FEAT-2", text: "Hi" })).toEqual({ ok: false, error: MESSAGE_MESSAGES.badStory });
    expect(parseMessageInput(null)).toEqual({ ok: false, error: MESSAGE_MESSAGES.badStory });
    expect(parseMessageInput({ story: "STORY-9", text: "  " })).toEqual({ ok: false, error: MESSAGE_MESSAGES.badText });
  });
});

describe("messageRefusal", () => {
  it("lets the Dev Lead that started an idle story message it", () => {
    expect(messageRefusal(started, "active", "STORY-54", idle, "lead-1")).toBeNull();
  });

  it("refuses a card that is gone, no story, with no session, or started by another chat", () => {
    expect(messageRefusal(undefined, "active", "STORY-54", idle, "lead-1")).toBe(MESSAGE_MESSAGES.gone);
    expect(messageRefusal({ ...started, type: "bug" }, "active", "STORY-54", idle, "lead-1")).toBe(
      MESSAGE_MESSAGES.notStory("STORY-54"),
    );
    expect(messageRefusal(started, "active", "STORY-54", null, "lead-1")).toBe(MESSAGE_MESSAGES.noSession("STORY-54"));
    expect(messageRefusal(started, "active", "STORY-54", idle, "lead-2")).toBe(MESSAGE_MESSAGES.notLead("STORY-54"));
  });

  it("refuses a Stopped story: only the user resumes it", () => {
    const stopped = stoppedStory(started, "user", at(2));
    expect(messageRefusal(stopped, "active", "STORY-54", idle, "lead-1")).toBe(
      "STORY-54 is stopped. Only the user can resume it.",
    );
  });

  it("refuses a session that is working or waiting for a slot", () => {
    expect(messageRefusal(started, "active", "STORY-54", { ...idle, running: true }, "lead-1")).toBe(
      MESSAGE_MESSAGES.working("STORY-54"),
    );
    expect(messageRefusal(started, "active", "STORY-54", { ...idle, queued: true }, "lead-1")).toBe(
      MESSAGE_MESSAGES.queued("STORY-54"),
    );
  });
});

describe("summaries", () => {
  it("puts text on one line and cuts it at the limit", () => {
    expect(oneLine("a\n\n b\t c ")).toBe("a b c");
    const cut = oneLine("x".repeat(NOTICE_SUMMARY_MAX + 20));
    expect(cut).toHaveLength(NOTICE_SUMMARY_MAX);
    expect(cut.endsWith("…")).toBe(true);
  });

  it("takes the last reply block of the turn, not an earlier one or the user's message", () => {
    const events: ChatEvent[] = [
      { type: "user", text: "Go" },
      text("a", "Earlier. "),
      text("b", "Last "),
      text("b", "words."),
    ];
    expect(lastMessage(events)).toBe("Last words.");
    expect(lastMessage([{ type: "user", text: "Go" }])).toBe("");
    expect(lastMessage([text("a", "Old turn."), { type: "user", text: "Go" }])).toBe("");
  });

  it("says why a failed turn failed, else what was last said", () => {
    const events: ChatEvent[] = [
      { type: "user", text: "Go" },
      text("a", "Working."),
      { type: "problem", problem: { type: "failed", message: "Out of credit." } },
    ];
    expect(turnSummary(events, "failed")).toBe("Out of credit.");
    expect(turnSummary(events, "done")).toBe("Working.");
  });

  it("joins a question's text", () => {
    expect(questionSummary([q("One?"), q("Two?")])).toBe("One?; Two?");
    expect(questionSummary([{ ...q("Which?"), options: [opt("A"), opt("B")] }])).toBe("Which? (A / B)");
  });

  it("holds every question a turn asked, bounded at the asks limit", () => {
    expect(askedSummary([[q("One?")], [q("Two?")]])).toBe("One? | Two?");
    const long = askedSummary([[q("x".repeat(ASKS_SUMMARY_MAX + 50))]]);
    expect(long).toHaveLength(ASKS_SUMMARY_MAX);
    expect(long.length).toBeGreaterThan(NOTICE_SUMMARY_MAX);
  });

  it("says which subagent asked a question, and leaves the session's own unlabelled", () => {
    expect(askedSummary([[q("One?")], [q("Two?")]], ["Review the diff", undefined])).toBe(
      "Asked by the subagent Review the diff: One? | Two?",
    );
    expect(askedSummary([[q("One?")]], [undefined])).toBe("One?");
  });

  it("tells the session what the user answered", () => {
    expect(userAnswerMessage({ "Which?": ["A", "B"] })).toBe("The user answered your question:\n- Which? A, B");
  });

  it("names the outcome a turn ended with", () => {
    expect(outcomeOf("done")).toBe("ended");
    expect(outcomeOf("stopped")).toBe("stopped");
    expect(outcomeOf("failed")).toBe("failed");
  });
});

describe("noticeMessage", () => {
  it("is one labelled message with a line per notice", () => {
    expect(
      noticeMessage([
        { story: "STORY-1", outcome: "ended", summary: "Done." },
        { story: "STORY-2", outcome: "failed", summary: "" },
      ]),
    ).toBe(`${NOTICE_LABEL}\n- STORY-1 ended: Done.\n- STORY-2 failed.`);
  });

  it("tells the Dev Lead how to answer only when a story asks", () => {
    const asks = noticeMessage([{ story: "STORY-1", outcome: "asks", summary: "Which?" }]);
    expect(asks.endsWith(NOTICE_ASKS_HINT)).toBe(true);
    expect(noticeMessage([{ story: "STORY-1", outcome: "ended", summary: "" }])).not.toContain(NOTICE_ASKS_HINT);
  });

  it("labels the Dev Lead's message to a session", () => {
    expect(leadMessage("Hi")).toBe("Message from the Dev Lead:\n\nHi");
  });
});
