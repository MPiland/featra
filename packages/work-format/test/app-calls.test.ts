/**
 * STORY-68 review (S1): the agent's raw tool row for one of Featra's app-approval tools is hidden once the app's card
 * for that call shows; a call that never became a card keeps its row.
 */
import { describe, expect, it } from "vitest";
import { cardCalls } from "../src/app-calls.ts";
import { foldChat, REPORT_BUG_TOOL, REQUEST_ACTION_TOOL, REQUEST_MERGE_TOOL, type ChatEvent } from "../src/index.ts";

const RAW = `mcp__featra__${REQUEST_ACTION_TOOL}`;
const user: ChatEvent = { type: "user", text: "go" };
const call = (id: string, input: object, name = RAW): ChatEvent => ({ type: "tool", id, name, input });
const card = (id: string, input: object, name = REQUEST_ACTION_TOOL): ChatEvent => ({
  type: "approval",
  id,
  name,
  input,
  forChat: false,
});
const signIn = { title: "Sign in", steps: [{ text: "Run it." }] };
const hidden = (events: ChatEvent[]) => [...cardCalls(foldChat(events).items)];

describe("the raw tool rows an app card stands for", () => {
  it("hides the agent's call once its card shows, while it waits, and after it is answered", () => {
    expect(hidden([user, call("t1", signIn)])).toEqual([]);
    const asked = [user, call("t1", { ...signIn, title: "  Sign   in " }), card("action-1", signIn)];
    expect(hidden(asked)).toEqual(["t1"]);
    expect(
      hidden([
        ...asked,
        { type: "tool-allowed", id: "action-1", name: REQUEST_ACTION_TOOL, input: signIn, scope: "once" },
      ]),
    ).toEqual(["t1"]);
    expect(hidden([...asked, { type: "approval-cancelled", id: "action-1" }])).toEqual(["t1"]);
  });

  it("does the same for the other app-approval tools", () => {
    const merge = { story: "STORY-1" };
    const bug = { title: "Spawn hangs" };
    expect(
      hidden([
        user,
        call("m", merge, `mcp__featra__${REQUEST_MERGE_TOOL}`),
        card("merge-1", { ...merge, into: "feature/1" }, REQUEST_MERGE_TOOL),
        call("b", bug, `mcp__featra__${REPORT_BUG_TOOL}`),
        card("bug-1", bug, REPORT_BUG_TOOL),
      ]),
    ).toEqual(["m", "b"]);
  });

  it("keeps a call that never became a card, another tool's call, and one from an earlier turn", () => {
    const refused = { type: "tool-result", id: "t0", output: "Not done. Give the steps.", isError: true } as const;
    const events: ChatEvent[] = [
      user,
      call("old", signIn),
      user,
      call("t0", { title: "Sign in" }),
      refused,
      call("x", signIn, "mcp__other__request_actions"),
      call("t1", signIn),
      card("action-1", signIn),
    ];
    expect(hidden(events)).toEqual(["t1"]);
    // A card for a different request takes no row.
    expect(hidden([user, call("t1", signIn), card("action-1", { ...signIn, title: "Approve the app" })])).toEqual([]);
  });

  it("pairs each card with its own call when an agent asks twice", () => {
    const other = { title: "Approve the app", steps: [{ text: "Open it." }] };
    const events = [user, call("t1", signIn), call("t2", other), card("action-2", other), card("action-1", signIn)];
    expect(hidden(events).toSorted()).toEqual(["t1", "t2"]);
  });
});
