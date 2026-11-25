/**
 * STORY-73: a notice of a story session's own (it waits for its design review) reaches the Dev Lead with the session's
 * turn. The real notices module, with only its host (the chats, opening and sending a chat's message) faked.
 */
import { describe, expect, it, vi } from "vitest";
import { noticeMessage, type Notice } from "@featra/work-format";
import type { Chat } from "../src/chat-state.ts";
import { createStoryNotices } from "../src/story-notices.ts";

type TestChat = Chat & { closed: boolean; refusal: string | null; running: boolean };

/** A chat as the notices module reads it: a Dev Lead, or a story session started by `parent`. */
function chatOf(id: string, parent?: string | null): TestChat {
  return {
    id,
    closed: false,
    refusal: null,
    running: false,
    events: [],
    summary: parent === undefined ? {} : { story: { id: `STORY-${id}`, parent } },
  } as unknown as TestChat;
}

/** Everything the promises of a delivery do, with no timer: a fresh turn of the event loop per tick. */
async function drain() {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
}

function world(parent: string | null = "lead") {
  const lead = chatOf("lead");
  const story = chatOf("7", parent);
  const chats = new Map([lead, story].map((c) => [c.id, c]));
  const sent = vi.fn<(id: string, text: string) => void>();
  const notices = createStoryNotices({
    chats,
    open: async () => {},
    send: sent,
    askUser: async () => ({ allow: false, message: "No." }),
    log: () => {},
  });
  return { lead, story, sent, notices };
}

const waits: Notice = {
  story: "STORY-7",
  outcome: "waits for design review",
  summary: "Screenshots in x/: ac1-page.png",
};

describe("a story session's own notice", () => {
  it("waits while its turn is on, and goes after the turn's notice in one message", async () => {
    const w = world();
    w.story.running = true;
    w.notices.from("7", waits);
    await drain();
    expect(w.sent).not.toHaveBeenCalled();

    w.story.running = false;
    w.notices.turnEnded(w.story, "done");
    await drain();
    expect(w.sent).toHaveBeenCalledOnce();
    expect(w.sent).toHaveBeenCalledWith(
      "lead",
      noticeMessage([{ story: "STORY-7", outcome: "ended", summary: "" }, waits]),
    );
  });

  it("goes at once when the session is idle", async () => {
    const w = world();
    w.notices.from("7", waits);
    await drain();
    expect(w.sent).toHaveBeenCalledWith("lead", noticeMessage([waits]));
  });

  it("goes nowhere when the story has no Dev Lead chat, or the chat isn't a story session", async () => {
    const w = world(null);
    w.notices.from("7", waits);
    w.notices.from("lead", waits);
    w.notices.from("gone", waits);
    w.story.running = true;
    w.notices.from("7", waits);
    w.notices.turnEnded(w.story, "done");
    await drain();
    expect(w.sent).not.toHaveBeenCalled();
  });

  it("is forgotten with the session's agent", async () => {
    const w = world();
    w.story.running = true;
    w.notices.from("7", waits);
    w.notices.forget(w.story);
    w.notices.turnEnded(w.story, "done");
    await drain();
    expect(w.sent).toHaveBeenCalledWith("lead", noticeMessage([{ story: "STORY-7", outcome: "ended", summary: "" }]));
  });
});
