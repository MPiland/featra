/** STORY-55: a subagent's row, its nesting under the session, and the label on its approvals and questions. */
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_ROLES,
  foldChat,
  nestChats,
  newSummary,
  normalizeChatEvent,
  normalizeSummary,
  type ChatEvent,
  type ChatSummary,
} from "../src/index.ts";

const DEV = BUILT_IN_ROLES.find((r) => r.id === "developer")!;
const chat = (id: string): ChatSummary => newSummary(id, "claude", DEV, "2026-11-11T10:00:00.000Z");
const sub = (id: string, parent: string, stoppable = true): ChatSummary => ({
  ...chat(id),
  subagent: { parent, stoppable },
});
const story = (id: string, parent: string | null): ChatSummary =>
  newSummary(id, "claude", DEV, "2026-11-11T10:00:00.000Z", "STORY-5", {
    id: "STORY-5",
    parent,
    feature: "FEAT-2",
    featureTitle: "Delegation",
  });

describe("nesting", () => {
  it("nests a subagent under its session, in the order given", () => {
    const nested = nestChats([chat("a"), sub("s1", "a"), sub("s2", "a")]);
    expect(nested.branches.map((b) => b.chat.id)).toEqual(["a"]);
    expect(nested.subagents.get("a")?.map((c) => c.id)).toEqual(["s1", "s2"]);
  });

  it("nests under a story session too, whichever row it is on", () => {
    const nested = nestChats([chat("lead"), story("st", "lead"), sub("s1", "st")]);
    expect(nested.branches[0]?.children.map((c) => c.id)).toEqual(["st"]);
    expect(nested.subagents.get("st")?.map((c) => c.id)).toEqual(["s1"]);
  });

  it("gives a subagent whose session isn't listed a row of its own", () => {
    const nested = nestChats([sub("s1", "gone")]);
    expect(nested.subagents.size).toBe(0);
    expect(nested.branches.map((b) => b.chat.id)).toEqual(["s1"]);
    expect(nested.groups).toEqual([]);
  });
});

describe("the row", () => {
  it("keeps what it says of its session and Stop, and drops a malformed one", () => {
    expect(normalizeSummary(sub("s1", "a", false))?.subagent).toEqual({ parent: "a", stoppable: false });
    expect(normalizeSummary({ ...chat("s1"), subagent: { parent: 3 } })?.subagent).toBeUndefined();
  });
});

describe("who asked", () => {
  const approval: ChatEvent = {
    type: "approval",
    id: "t1",
    name: "Bash",
    input: { command: "ls" },
    forChat: false,
    subagent: "Review the diff",
  };
  const question: ChatEvent = {
    type: "question",
    id: "q1",
    name: "AskUserQuestion",
    questions: [
      { question: "Which?", header: "Pick", options: [{ label: "A", description: "a" }], multiSelect: false },
    ],
    subagent: "Review the diff",
  };

  it("keeps the subagent on an approval and a question through saving", () => {
    expect(normalizeChatEvent(JSON.parse(JSON.stringify(approval)))).toEqual(approval);
    expect(normalizeChatEvent(JSON.parse(JSON.stringify(question)))).toEqual(question);
  });

  it("shows it on the pending call, and not on a call the session itself asked", () => {
    const items = foldChat([approval, { ...approval, id: "t2", subagent: undefined }, question]).items;
    const row = (id: string) => items.find((i) => i.kind === "tool" && i.id === id);
    expect(row("t1")).toMatchObject({ approval: { status: "pending", subagent: "Review the diff" } });
    expect(row("t2")).toMatchObject({ approval: { status: "pending" } });
    expect(row("t2")).not.toMatchObject({ approval: { subagent: expect.anything() } });
    expect(row("q1")).toMatchObject({ question: { status: "pending", subagent: "Review the diff" } });
  });
});
