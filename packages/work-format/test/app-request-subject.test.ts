/**
 * STORY-13 review, ruling 9: an app request that isn't about a story (report_bug's bug) carries its own `subject`, and
 * like a story's request it outlives the turn and the message that came after it.
 */
import { describe, expect, it } from "vitest";
import { foldChat, nextAsks, normalizeChatEvent, REPORT_BUG_TOOL, type ChatEvent } from "../src/index.ts";

const asked: ChatEvent = {
  type: "approval",
  id: "b1",
  name: REPORT_BUG_TOOL,
  input: {},
  forChat: false,
  subject: 'Bug "Spawn hangs"',
};
const own: ChatEvent = { type: "approval", id: "a", name: "Bash", input: {}, forChat: false };
const done: ChatEvent = { type: "turn-end", outcome: "done" };

describe("an app request's subject (ruling 9)", () => {
  it("crosses the wire, and an empty one is dropped", () => {
    expect(normalizeChatEvent(JSON.parse(JSON.stringify(asked)))).toEqual(asked);
    expect(normalizeChatEvent({ ...asked, subject: "" })).not.toHaveProperty("subject");
  });

  it("keeps the request open past the turn and the next message, while the chat's own request closes", () => {
    const open = nextAsks(nextAsks([], own), asked);
    expect(nextAsks(open, done)).toEqual([{ id: "b1", reason: "approval", subject: 'Bug "Spawn hangs"' }]);
    expect(nextAsks(open, { type: "user", text: "go" }).map((a) => a.id)).toEqual(["b1"]);
  });

  it("keeps its row waiting when the turn ends", () => {
    const row = foldChat([asked, done]).items.find((i) => i.kind === "tool");
    expect(row).toMatchObject({
      cancelled: false,
      approval: { status: "pending", subject: 'Bug "Spawn hangs"' },
    });
    expect(row).not.toHaveProperty("approval.story");
  });
});
