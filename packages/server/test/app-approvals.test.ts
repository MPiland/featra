/**
 * STORY-13 review fixes (PR #46): the approvals the app asks itself. Only they take a chosen option (ruling 6); one the
 * chat's end cancels is told apart from the user's Deny (ruling 8); and report_bug's is about its bug, not a story
 * (ruling 9). The real approval desk, session manager and Claude adapter; only the SDK's `query` is fake. The bug
 * request runs the real filing on a real repository; what it tells the Dev Lead is recorded where the chat would post it.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  CHAT_MESSAGES,
  noticeLine,
  REPORT_BUG_MESSAGES,
  REPORT_BUG_TOOL,
  type ChatEvent,
  type Notice,
} from "@featra/work-format";
import { createApprovalDesk } from "../src/approval-desk.ts";
import { createBugFiling } from "../src/bug-filing.ts";
import { bugSubject, createBugRequest } from "../src/bug-request.ts";
import { chat, closeChats, DIR } from "./chat-fixture.ts";
import { mergeWorld } from "./story-merge-world.ts";
import { until } from "./until.ts";

afterEach(closeChats);

const CHOICES = { proposed: "project", choices: [{ key: "project", label: "Project" }] };
const request = { chat: "c1", cwd: DIR, id: "t1", name: "some_tool", input: CHOICES };

describe("a chosen option (ruling 6)", () => {
  it("is refused on an agent's own tool, whatever its input offers, and the request keeps waiting", async () => {
    const desk = createApprovalDesk(() => {});
    const decided = desk.approve(request, new AbortController().signal);
    expect(() => desk.answer("c1", "t1", { choice: "allow", option: "project" })).toThrow(CHAT_MESSAGES.badOption);
    desk.answer("c1", "t1", { choice: "allow" });
    expect(await decided).toEqual({ allow: true, input: CHOICES });
  });

  it("is taken on a request the app asks", async () => {
    const desk = createApprovalDesk(() => {});
    const decided = desk.approve({ ...request, app: true }, new AbortController().signal);
    desk.answer("c1", "t1", { choice: "allow", option: "project" });
    expect(await decided).toEqual({ allow: true, input: { ...CHOICES, option: "project" } });
  });
});

const approvals = (events: ChatEvent[]) =>
  events.filter((e): e is Extract<ChatEvent, { type: "approval" }> => e.type === "approval");
const ask = { id: "b1", name: REPORT_BUG_TOOL, input: CHOICES, subject: bugSubject("Spawn hangs") };

describe("an app request with choices, as the chat manager asks it (rulings 8, 9)", () => {
  it("is 'cancelled' when the chat ends before the user answers", async () => {
    const c = await chat("dev-lead");
    const answer = c.manager.askChoice(c.id, ask);
    await until(() => approvals(c.events).length === 1);
    c.manager.closeProjects(() => false);
    expect(await answer).toBe("cancelled");
  });

  it("is 'denied' when the user denies it", async () => {
    const c = await chat("dev-lead");
    const answer = c.manager.askChoice(c.id, ask);
    await until(() => approvals(c.events).length === 1);
    c.manager.approve(c.id, "b1", { choice: "deny" });
    expect(await answer).toBe("denied");
  });

  it("is about its subject, not a story, and stays open past the turn", async () => {
    const c = await chat("dev-lead");
    void c.manager.askChoice(c.id, ask);
    await until(() => approvals(c.events).length === 1);
    expect(approvals(c.events)[0]).toMatchObject({ subject: bugSubject("Spawn hangs") });
    expect(approvals(c.events)[0]).not.toHaveProperty("story");
    expect(c.manager.list(DIR)[0]?.waiting).toBe("approval");
    expect(c.view().items.find((i) => i.kind === "tool")).toMatchObject({
      approval: { status: "pending", subject: bugSubject("Spawn hangs") },
    });
  });
});

describe("report_bug whose chat ends before the user answers (ruling 8)", { timeout: 60_000 }, () => {
  const m = mergeWorld();

  it("tells the Dev Lead the bug wasn't filed because the request was cancelled, and writes nothing", async () => {
    await m.start({ remote: false });
    const c = await chat("dev-lead");
    const told: Notice[] = [];
    const bugs = createBugRequest({
      chats: { askChoice: c.manager.askChoice, notify: (_id, notice) => told.push(notice) },
      bugs: createBugFiling({ scan: m.w.watches.scan, now: m.w.clock.now }),
      log: () => {},
    });
    const before = m.w.repo.git(m.w.repo.main, "for-each-ref", "--format=%(objectname)", "refs/heads");
    await bugs.report(m.w.repo.main, { title: "Spawn hangs", description: "", cause: null }, c.id);
    await until(() => approvals(c.events).length === 1);
    c.manager.closeProjects(() => false);
    await until(() => told.length === 1);
    expect(told.map(noticeLine)).toEqual([`${bugSubject("Spawn hangs")} not filed: ${REPORT_BUG_MESSAGES.cancelled}`]);
    expect(noticeLine(told[0]!)).toBe('Bug "Spawn hangs" not filed: the request was cancelled');
    expect(m.w.repo.git(m.w.repo.main, "for-each-ref", "--format=%(objectname)", "refs/heads")).toBe(before);
    expect(m.w.repo.git(m.w.repo.main, "status", "--porcelain")).toBe("");
  });
});
