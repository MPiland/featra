/** STORY-49: one rule for which draft belongs to a chat, for the server's revision and the client's pane. */
import { describe, expect, it } from "vitest";
import { draftedBy, draftedFeature, newestDraft, openDraft, type Card } from "../src/index.ts";
import { apply, input, story } from "./draft-fixtures.ts";

describe("newestDraft", () => {
  it("is the highest-numbered item of the chat, not the first listed, and ignores other chats", () => {
    const items = [
      { id: "FEAT-10", chat: "a" },
      { id: "FEAT-9", chat: "a" },
      { id: "FEAT-11", chat: "b" },
      { id: null, chat: "a" },
    ];
    expect(newestDraft("a", items)?.id).toBe("FEAT-10");
    expect(newestDraft("b", items)?.id).toBe("FEAT-11");
    expect(newestDraft("c", items)).toBeNull();
  });

  it("is what the server revises when a chat has two drafts", () => {
    const { cards, plan } = apply([], input([story()]), "chat-1");
    const old = cards.find((c) => c.id === plan.result.feature) as Card;
    const newer = { ...old, id: "FEAT-20", title: "Newer" };
    const both = [newer, ...cards];
    expect(draftedFeature("chat-1", both)?.id).toBe("FEAT-20");
    expect(openDraft("chat-1", both)?.id).toBe("FEAT-20");
    expect(both.filter((c) => c.type === "feature" && draftedBy(c) === "chat-1")).toHaveLength(2);
  });
});
