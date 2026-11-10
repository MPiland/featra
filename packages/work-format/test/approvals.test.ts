/** STORY-45: tool approvals: the answer's params, the events, the fold and the waiting dot. */
import { describe, expect, it } from "vitest";
import {
  APPROVAL_CHOICES,
  BUILT_IN_ROLES,
  chatApproveParams,
  DENY_REASON_MAX,
  denyMessage,
  foldChat,
  idleSummary,
  newSummary,
  normalizeChatEvent,
  normalizeSavedChats,
  reduceRow,
  SERVER_METHODS,
  WAIT_REASONS,
  type ChatEvent,
  type ChatRow,
} from "../src/index.ts";

const BASH = { command: "npm test" };
const DEVELOPER = BUILT_IN_ROLES.find((r) => r.id === "developer")!;
const START: ChatRow = { summary: newSummary("c1", "claude", DEVELOPER, "2026-11-09T10:00:00.000Z"), asks: [] };
const rows = (events: ChatEvent[]) => events.reduce(reduceRow, START);

const call: ChatEvent = { type: "tool", id: "t1", name: "Bash", input: BASH };
const ask = (id = "t1", forChat = true): ChatEvent => ({ type: "approval", id, name: "Bash", input: BASH, forChat });
const COVERED: ChatEvent = {
  type: "approval",
  id: "t1",
  name: "Bash",
  input: BASH,
  forChat: true,
  covers: "npm test commands",
};
const allowed = (id = "t1", scope: "once" | "chat" = "once"): ChatEvent => ({
  type: "tool-allowed",
  id,
  name: "Bash",
  input: BASH,
  scope,
});
const denied = (reason?: string): ChatEvent => ({
  type: "tool-denied",
  id: "t1",
  name: "Bash",
  input: BASH,
  ...(reason ? { reason } : {}),
});
const turn = (outcome: "done" | "stopped"): ChatEvent => ({ type: "turn-end", outcome });
const toolOf = (events: ChatEvent[]) => foldChat(events).items.find((i) => i.kind === "tool");

describe("AC1: Deny's optional reason is sent to the agent", () => {
  it("tells the agent the reason, trimmed and cut to its limit, or just that the user denied it", () => {
    expect(denyMessage(" Unit only. ")).toBe("The user denied this tool call: Unit only.");
    expect(denyMessage()).toBe("The user denied this tool call.");
    expect(denyMessage("   ")).toBe("The user denied this tool call.");
    expect(denyMessage("x".repeat(DENY_REASON_MAX + 9))).toBe(
      `The user denied this tool call: ${"x".repeat(DENY_REASON_MAX)}`,
    );
  });

  it("reads chat.approve's params, keeping a reason only for Deny", () => {
    expect(SERVER_METHODS).toContain("chat.approve");
    expect(APPROVAL_CHOICES).toEqual(["allow", "allow-chat", "deny"]);
    expect(chatApproveParams({ id: "c", tool: "t", choice: "deny", reason: " why " })).toEqual({
      id: "c",
      tool: "t",
      answer: { choice: "deny", reason: "why" },
    });
    expect(chatApproveParams({ id: "c", tool: "t", choice: "deny", reason: " " })).toEqual({
      id: "c",
      tool: "t",
      answer: { choice: "deny" },
    });
    expect(chatApproveParams({ id: "c", tool: "t", choice: "allow", reason: "x" })?.answer).toEqual({
      choice: "allow",
    });
    for (const bad of [
      null,
      {},
      { id: "c", tool: "t" },
      { id: "", tool: "t", choice: "allow" },
      { id: "c", tool: "", choice: "allow" },
      { id: "c", tool: "t", choice: "yes" },
      { id: "c", tool: "t", choice: "deny", reason: 3 },
    ]) {
      expect(chatApproveParams(bad)).toBeNull();
    }
  });
});

describe("the approval events cross the wire", () => {
  it("keeps every well-formed one and drops the rest", () => {
    for (const e of [
      ask(),
      ask("t2", false),
      allowed(),
      allowed("t1", "chat"),
      denied("why"),
      denied(),
      { type: "approval-cancelled", id: "t1" } as ChatEvent,
    ]) {
      expect(normalizeChatEvent(JSON.parse(JSON.stringify(e)))).toEqual(e);
    }
    expect(normalizeChatEvent({ ...denied(), reason: "" })).toEqual(denied());
    // Allow for this chat is offered only when the request says so.
    expect(normalizeChatEvent({ type: "approval", id: "t1", name: "Bash", input: BASH })).toEqual(ask("t1", false));
    expect(normalizeChatEvent({ type: "approval", id: "t1", input: BASH, forChat: true })).toBeNull();
    expect(normalizeChatEvent(JSON.parse(JSON.stringify(COVERED)))).toEqual(COVERED);
    expect(normalizeChatEvent({ ...COVERED, forChat: false })).toEqual(ask("t1", false));
    expect(normalizeChatEvent({ ...COVERED, covers: "" })).toEqual(ask());
    expect(normalizeChatEvent({ type: "tool-allowed", id: "t1", name: "Bash", scope: "forever" })).toBeNull();
    expect(normalizeChatEvent({ type: "approval-cancelled" })).toBeNull();
  });
});

describe("AC1, AC2: the tool row follows the request", () => {
  it("waits with Allow for this chat offered or not, then shows how it was answered", () => {
    expect(toolOf([call, ask()])).toMatchObject({ approval: { status: "pending", forChat: true } });
    expect(toolOf([call, ask("t1", false)])).toMatchObject({ approval: { status: "pending", forChat: false } });
    expect(toolOf([call, COVERED])).toMatchObject({
      approval: { status: "pending", forChat: true, covers: "npm test commands" },
    });
    expect(toolOf([call, ask(), allowed()])).toMatchObject({ approval: { status: "allowed", scope: "once" } });
    expect(toolOf([call, ask(), allowed("t1", "chat")])).toMatchObject({
      approval: { status: "allowed", scope: "chat" },
    });
    expect(toolOf([call, ask(), denied("Unit only.")])).toMatchObject({
      denied: true,
      reason: "Unit only.",
      approval: null,
    });
    expect(toolOf([call, ask(), denied()])).toMatchObject({ denied: true, reason: null });
  });

  it("takes a request or an answer that arrives before its tool row, and keeps it when the row comes", () => {
    expect(toolOf([ask(), call])).toMatchObject({ name: "Bash", input: BASH, approval: { status: "pending" } });
    expect(toolOf([allowed("t1", "chat"), call])).toMatchObject({ approval: { status: "allowed", scope: "chat" } });
  });

  it("shows a request that ended unanswered as cancelled, never denied", () => {
    const cancel: ChatEvent = { type: "approval-cancelled", id: "t1" };
    expect(toolOf([call, ask(), cancel])).toMatchObject({ cancelled: true, denied: false, approval: null });
    // Only a waiting row is cancelled: an answered one keeps its answer.
    expect(toolOf([call, ask(), allowed(), cancel])).toMatchObject({
      cancelled: false,
      approval: { status: "allowed" },
    });
  });

  it("ends a still-waiting call with its turn: stopped by Stop, cancelled otherwise (a restart's history)", () => {
    expect(toolOf([call, ask(), turn("stopped")])).toMatchObject({ stopped: true, cancelled: false, approval: null });
    expect(toolOf([call, turn("done")])).toMatchObject({ cancelled: true, stopped: false, denied: false });
    expect(toolOf([call, denied(), turn("done")])).toMatchObject({ cancelled: false, denied: true });
    expect(toolOf([call, { type: "tool-result", id: "t1", output: "ok", isError: false }, turn("done")])).toMatchObject(
      {
        cancelled: false,
      },
    );
  });
});

describe("AC4: a chat waiting on an approval is marked waiting", () => {
  it("waits on the approval while any request is open, and on nothing once all are answered", () => {
    const user: ChatEvent = { type: "user", text: "test it" };
    expect(WAIT_REASONS).toContain("approval");
    expect(rows([user, call, ask()]).summary).toMatchObject({ waiting: "approval", running: true });
    expect(rows([user, call, ask(), allowed()]).summary.waiting).toBeNull();
    expect(rows([user, call, ask(), ask("t2"), allowed()]).summary.waiting).toBe("approval");
    expect(rows([user, call, ask(), ask("t2"), allowed(), denied()]).summary.waiting).toBe("approval");
    expect(rows([user, call, ask(), ask("t2"), allowed(), allowed("t2")]).summary.waiting).toBeNull();
    expect(rows([user, call, ask(), { type: "approval-cancelled", id: "t1" }]).summary.waiting).toBeNull();
    expect(rows([user, call, ask(), turn("stopped")])).toMatchObject({ asks: [], summary: { waiting: null } });
    expect(rows([user, call, ask(), turn("done")])).toMatchObject({ asks: [], summary: { waiting: "reply" } });
  });

  it("never keeps an approval wait out of a turn, so a saved or restarted chat waits on a reply", () => {
    const waiting = rows([{ type: "user", text: "x" }, call, ask()]).summary;
    expect(idleSummary(waiting)).toMatchObject({ waiting: "reply", running: false });
    const saved = normalizeSavedChats({ version: 1, chats: [{ dir: "/p", session: "s", summary: waiting }] });
    expect(saved.chats[0]?.summary).toMatchObject({ waiting: "reply", running: false });
  });
});

describe("AC3: each role has a permission mode", () => {
  it("starts the five built-in roles in Ask", () => {
    expect(BUILT_IN_ROLES).toHaveLength(5);
    expect(BUILT_IN_ROLES.every((r) => r.permission === "ask")).toBe(true);
  });
});
