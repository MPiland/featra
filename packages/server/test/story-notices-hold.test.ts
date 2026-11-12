/**
 * STORY-54 (review): what the notices module holds and when it lets go. The real notices module, with only its host (the
 * chats, opening and sending a chat's message, asking the user) faked: a Dev Lead whose turn the user stopped holds its
 * notices, a chat that ends forgets what it held, a question whose Dev Lead is gone asks the user, and a delivery that
 * failed is dropped only when it can never succeed.
 */
import { describe, expect, it, vi } from "vitest";
import { askedSummary, noticeMessage, userAnswerMessage, type Question, type TurnOutcome } from "@featra/work-format";
import type { Chat } from "../src/chat-state.ts";
import type { QuestionDecision } from "../src/provider.ts";
import { createStoryNotices } from "../src/story-notices.ts";

const COLOUR: Question = {
  question: "Colour?",
  header: "Colour",
  options: [
    { label: "Blue", description: "" },
    { label: "Red", description: "" },
  ],
  multiSelect: false,
};
const SIZE: Question = { question: "Size?", header: "Size", options: [], multiSelect: false };
/** A question as the provider asks it. */
const ask = (question: Question) => ({ id: `ask-${question.header}`, name: "AskUserQuestion", questions: [question] });

/** A chat as the notices module reads it: a Dev Lead, or a story session started by `parent`. */
function chatOf(id: string, parent?: string) {
  return {
    id,
    closed: false,
    refusal: null,
    running: false,
    events: [],
    summary: parent === undefined ? {} : { story: { id: `STORY-${id}`, parent } },
  } as unknown as Chat & { closed: boolean; refusal: string | null; running: boolean };
}

/** Everything the promises of a delivery do, with no timer: a fresh turn of the event loop per tick. */
async function drain() {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
}

function world(send: (id: string, text: string) => void = () => {}) {
  const lead = chatOf("lead");
  const story = chatOf("7", "lead");
  const chats = new Map([lead, story].map((c) => [c.id, c]));
  const sent = vi.fn<(id: string, text: string) => void>(send);
  const askUser = vi.fn<(c: Chat, request: ReturnType<typeof ask>) => Promise<QuestionDecision>>(async () => ({
    allow: true,
    answers: { "Colour?": ["Blue"] },
  }));
  const open = vi.fn<(id: string) => Promise<void>>(async () => {});
  const log = vi.fn<(message: string) => void>();
  const notices = createStoryNotices({ chats, open, send: sent, askUser, log });
  const end = async (c: Chat, outcome: TurnOutcome) => {
    notices.turnEnded(c, outcome);
    await drain();
  };
  return { lead, story, chats, sent, askUser, open, log, notices, end };
}

const ended = (summary = "") => noticeMessage([{ story: "STORY-7", outcome: "ended", summary }]);

describe("a Dev Lead whose turn the user stopped", () => {
  it("is not given the notices that waited, until a turn that is not a stop ends", async () => {
    const w = world();
    await w.end(w.lead, "stopped");
    await w.end(w.story, "done");
    expect(w.sent).not.toHaveBeenCalled();

    await w.end(w.lead, "done");
    expect(w.sent).toHaveBeenCalledOnce();
    expect(w.sent).toHaveBeenCalledWith("lead", ended());
  });

  it("is given them at once when it was not stopped", async () => {
    const w = world();
    await w.end(w.story, "done");
    expect(w.sent).toHaveBeenCalledWith("lead", ended());
  });

  it("goes on holding them through a second stop", async () => {
    const w = world();
    await w.end(w.lead, "stopped");
    await w.end(w.story, "done");
    await w.end(w.lead, "stopped");
    expect(w.sent).not.toHaveBeenCalled();
    await w.end(w.lead, "failed");
    expect(w.sent).toHaveBeenCalledOnce();
  });
});

describe("a story's questions, asked in one turn", () => {
  it("all go in one notice, each with its options, none overwritten", async () => {
    const w = world();
    expect(w.notices.asked(w.story, ask(COLOUR))).not.toBeNull();
    expect(w.notices.asked(w.story, ask(SIZE))).not.toBeNull();
    await w.end(w.story, "done");
    const expected = noticeMessage([{ story: "STORY-7", outcome: "asks", summary: askedSummary([[COLOUR], [SIZE]]) }]);
    expect(w.sent).toHaveBeenCalledWith("lead", expected);
    expect(expected).toContain("Colour? (Blue / Red) | Size?");
  });
});

describe("a chat that ends", () => {
  it("forgets the questions its story asked: the next turn's notice does not repeat them", async () => {
    const w = world();
    w.notices.asked(w.story, ask(COLOUR));
    w.notices.forget(w.story);
    await w.end(w.story, "done");
    expect(w.sent).toHaveBeenCalledWith("lead", ended());
    expect(w.askUser).not.toHaveBeenCalled();
  });

  it("forgets the notices that waited for it", async () => {
    const w = world();
    w.lead.running = true;
    await w.end(w.story, "done");
    expect(w.sent).not.toHaveBeenCalled();

    w.notices.forget(w.lead);
    w.lead.running = false;
    await w.end(w.lead, "done");
    expect(w.sent).not.toHaveBeenCalled();
  });
});

describe("a question held when the Dev Lead is gone by the end of the turn", () => {
  it("asks the user, as a story with no Dev Lead does, and tells the session the answer", async () => {
    const w = world();
    w.notices.asked(w.story, ask(COLOUR));
    w.lead.closed = true;
    await w.end(w.story, "done");

    expect(w.askUser).toHaveBeenCalledWith(w.story, ask(COLOUR));
    expect(w.open).toHaveBeenCalledWith("7");
    expect(w.sent).toHaveBeenCalledOnce();
    expect(w.sent).toHaveBeenCalledWith("7", userAnswerMessage({ "Colour?": ["Blue"] }));
  });

  it("tells the session nothing when the user turns the question down", async () => {
    const w = world();
    w.askUser.mockResolvedValueOnce({ allow: false, message: "No." });
    w.notices.asked(w.story, ask(COLOUR));
    w.lead.closed = true;
    await w.end(w.story, "done");
    expect(w.askUser).toHaveBeenCalledOnce();
    expect(w.sent).not.toHaveBeenCalled();
  });
});

describe("a notice that could not be delivered", () => {
  it("is kept for the next idle when the error may pass", async () => {
    let calls = 0;
    const w = world(() => {
      if (++calls === 1) throw new Error("Busy for a moment.");
    });
    await w.end(w.story, "done");
    expect(w.sent).toHaveBeenCalledOnce();
    expect(w.log).toHaveBeenCalledWith(expect.stringContaining("Busy for a moment."));

    await w.end(w.lead, "done");
    expect(w.sent).toHaveBeenCalledTimes(2);
    expect(w.sent).toHaveBeenLastCalledWith("lead", ended());
  });

  it("is dropped when the Dev Lead was closed", async () => {
    const w = world(() => {
      w.lead.closed = true;
      throw new Error("Closed.");
    });
    await w.end(w.story, "done");
    w.lead.closed = false;
    await w.end(w.lead, "done");
    expect(w.sent).toHaveBeenCalledOnce();
  });

  it("is dropped when the Dev Lead can't take a message at all", async () => {
    const w = world(() => {
      w.lead.refusal = "No provider.";
      throw new Error("No provider.");
    });
    await w.end(w.story, "done");
    w.lead.refusal = null;
    await w.end(w.lead, "done");
    expect(w.sent).toHaveBeenCalledOnce();
  });
});
