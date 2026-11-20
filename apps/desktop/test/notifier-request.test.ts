import { describe, expect, it } from "vitest";
import { REQUEST_ACTION_TOOL, type InboxItem } from "@featra/work-format";
import { createNotifier, notificationBody } from "../src/notifier.ts";

/**
 * STORY-68 AC4: an agent's request to the user is told as it arrives, like a tool approval, and the notification says
 * what it asks rather than naming the tool. The notifier is the real one; only Electron's Notification is stood in for.
 */
const request = (title: string): InboxItem => ({
  chat: "chat-1",
  chatName: "Ship the release",
  request: {
    type: "approval",
    id: "action-1",
    name: REQUEST_ACTION_TOOL,
    input: { title, steps: [{ text: "Run it.", command: "gh auth login" }] },
    forChat: false,
  },
  since: "2026-11-20T10:00:00.000Z",
});

describe("AC4: a request is told as it arrives, saying what it asks", () => {
  it("shows one when Featra isn't focused, with the chat and the request's title", () => {
    const shown: string[] = [];
    const notifier = createNotifier({
      enabled: () => true,
      focused: () => false,
      show: (n) => void shown.push(n.body),
      open: () => {},
    });
    notifier.asked(request("Sign in to the CLI"));
    expect(shown).toEqual(["Ship the release: Sign in to the CLI"]);
  });

  it("cuts a long title short, as it does a question", () => {
    const body = notificationBody(request(`Approve ${"the app ".repeat(14)}`));
    // The title is cut to 80 characters, its last one the ellipsis.
    expect(body).toBe(`Ship the release: Approve ${"the app ".repeat(8)}the app…`);
    expect(body).toMatch(/^Ship the release: Approve the app .*…$/);
  });

  it("names the tool, as for any approval, when the input isn't a request", () => {
    const odd = request("x");
    if (odd.request.type === "approval") odd.request = { ...odd.request, input: { command: "ls" } };
    expect(notificationBody(odd)).toBe(`Ship the release: approve ${REQUEST_ACTION_TOOL}`);
  });
});
