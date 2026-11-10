import { describe, expect, it } from "vitest";
import type { InboxItem } from "@featra/work-format";
import { createNotifier, notificationBody } from "../src/notifier.ts";

/**
 * STORY-7 AC3: a desktop notification as soon as a request arrives while Featra isn't focused; clicking it opens the chat;
 * Settings can turn it off. The notifier is the real one; only Electron's Notification and window are stood in for.
 */
const approval: InboxItem = {
  chat: "chat-1",
  chatName: "Fix the build",
  request: { type: "approval", id: "t1", name: "Bash", input: { command: "npm test" }, forChat: true },
  since: "2026-11-09T10:00:00.000Z",
};
const question: InboxItem = {
  chat: "chat-2",
  chatName: "Plan the release",
  request: {
    type: "question",
    id: "q1",
    name: "AskUserQuestion",
    questions: [{ question: "Which?", header: "", options: [{ label: "A", description: "" }], multiSelect: false }],
  },
  since: "2026-11-09T10:00:00.000Z",
};

function setup(state: { enabled?: boolean; focused?: boolean } = {}) {
  const shown: { title: string; body: string; click: () => void }[] = [];
  const opened: string[] = [];
  const s = { enabled: true, focused: false, ...state };
  const notifier = createNotifier({
    enabled: () => s.enabled,
    focused: () => s.focused,
    show: (n) => void shown.push(n),
    open: (chat) => void opened.push(chat),
  });
  return { notifier, shown, opened, state: s };
}

describe("AC3: notifications", () => {
  it("shows one for an approval as it arrives when Featra isn't focused, naming the chat and the tool", () => {
    const { notifier, shown } = setup();
    notifier.asked(approval);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.title).toBe("Featra");
    expect(shown[0]?.body).toBe(notificationBody(approval));
    expect(shown[0]?.body).toContain("Fix the build");
    expect(shown[0]?.body).toContain("Bash");
  });

  it("shows one for a question too", () => {
    const { notifier, shown } = setup();
    notifier.asked(question);
    expect(shown.map((n) => n.body)).toEqual([notificationBody(question)]);
  });

  it("opens the chat when it is clicked", () => {
    const { notifier, shown, opened } = setup();
    notifier.asked(question);
    expect(opened).toEqual([]);
    shown[0]?.click();
    expect(opened).toEqual(["chat-2"]);
  });

  it("shows none while Featra is focused", () => {
    const { notifier, shown } = setup({ focused: true });
    notifier.asked(approval);
    expect(shown).toEqual([]);
  });

  it("follows focus as it changes: none while focused, one after the user leaves", () => {
    const { notifier, shown, state } = setup({ focused: true });
    notifier.asked(approval);
    state.focused = false;
    notifier.asked(question);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.body).toBe(notificationBody(question));
  });

  it("shows none when notifications are turned off, and again when they are turned back on", () => {
    const { notifier, shown, state } = setup({ enabled: false });
    notifier.asked(approval);
    expect(shown).toEqual([]);
    state.enabled = true;
    notifier.asked(approval);
    expect(shown).toHaveLength(1);
  });

  it("ignores what the page sends that isn't a request", () => {
    const { notifier, shown } = setup();
    notifier.asked(null);
    notifier.asked({ chat: "x" });
    notifier.asked({ ...approval, request: { type: "text", block: "b", delta: "hi" } });
    expect(shown).toEqual([]);
  });
});

/** A notifier whose notifications can be closed, as Electron's can. */
function closable() {
  const shown: { body: string; open: boolean; click: () => void }[] = [];
  const opened: [string, string | undefined][] = [];
  const notifier = createNotifier({
    enabled: () => true,
    focused: () => false,
    show: (n) => {
      const toast = { body: n.body, open: true, click: n.click };
      shown.push(toast);
      return { close: () => void (toast.open = false) };
    },
    open: (chat, project) => void opened.push([chat, project]),
  });
  return { notifier, shown, opened };
}

describe("review fixes: one toast per chat, the question's words, and the project to open", () => {
  const second: InboxItem = { ...approval, request: { ...approval.request, id: "t2" } };

  it("replaces a chat's notification with its next one instead of stacking them", () => {
    const { notifier, shown } = closable();
    notifier.asked(approval);
    notifier.asked(second);
    expect(shown.map((n) => n.open)).toEqual([false, true]);
  });

  it("keeps a separate notification for each chat", () => {
    const { notifier, shown } = closable();
    notifier.asked(approval);
    notifier.asked(question);
    notifier.asked({ ...approval, request: { ...approval.request, id: "t3" } });
    expect(shown.map((n) => n.open)).toEqual([false, true, true]);
  });

  it("says what the question asks, cut short when it is long", () => {
    const { notifier, shown } = closable();
    notifier.asked(question);
    expect(shown[0]?.body).toBe("Plan the release: Which?");
    const long = "Why ".repeat(100).trim();
    const item: InboxItem = {
      ...question,
      request: {
        ...question.request,
        questions: [{ question: long, header: "", options: [], multiSelect: false }],
      } as InboxItem["request"],
    };
    expect(notificationBody(item).length).toBeLessThan(120);
    expect(notificationBody(item)).toMatch(/…$/);
  });

  it("opens the chat in its project", () => {
    const { notifier, shown, opened } = closable();
    notifier.asked({ ...approval, project: "/work/other" });
    shown[0]?.click();
    expect(opened).toEqual([["chat-1", "/work/other"]]);
  });
});
