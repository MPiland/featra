/** STORY-53 AC1: the agent's thinking is part of the chat's events and of what the chat view shows, apart from its reply. */
import { describe, expect, it } from "vitest";
import { foldChat, normalizeChatEvent, normalizeChatSnapshot, type ChatEvent } from "../src/index.ts";

describe("thinking events", () => {
  it("come back from the socket as they went, and a malformed one is dropped", () => {
    const events: ChatEvent[] = [{ type: "thinking", block: "m1:0", delta: "Let me check." }];
    expect(normalizeChatSnapshot(JSON.parse(JSON.stringify({ events })))).toEqual({ events });
    expect(normalizeChatEvent({ type: "thinking", block: "", delta: "x" })).toBeNull();
    expect(normalizeChatEvent({ type: "thinking", block: "m1:0" })).toBeNull();
  });

  it("join into one thinking row per block, apart from the reply that follows", () => {
    const state = foldChat([
      { type: "user", text: "go" },
      { type: "thinking", block: "m1:0", delta: "Let me " },
      { type: "thinking", block: "m1:0", delta: "check." },
      { type: "text", block: "m1:1", delta: "Done." },
      { type: "thinking", block: "m2:0", delta: "Again." },
    ]);
    expect(state.items.map((i) => [i.kind, "text" in i ? i.text : ""])).toEqual([
      ["user", "go"],
      ["thinking", "Let me check."],
      ["assistant", "Done."],
      ["thinking", "Again."],
    ]);
  });
});
