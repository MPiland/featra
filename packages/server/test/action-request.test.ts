/**
 * STORY-68: an agent's `request_action` through the real agent bridge, action request, chat manager, approval desk and
 * Inbox. The agent's turn is played by the fake Agent SDK; the clock and timers are the test's. The user answers as
 * the card's buttons do, with `approve`.
 */
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPROVAL_CANCELLED,
  ACTION_MESSAGES,
  CHAT_MESSAGES,
  REQUEST_ACTION_TOOL,
  type ActionRequest,
  type ChatEvent,
  type InboxItem,
} from "@featra/work-format";
import { createActionRequest } from "../src/action-request.ts";
import { AGENT_MESSAGES, createAgentBridge } from "../src/agent-bridge.ts";
import type { ChatManager } from "../src/chat-manager.ts";
import { createLogWriter } from "../src/log-writer.ts";
import { DIR } from "./chat-fixture.ts";
import { sdk } from "./fake-query.ts";
import { WAIT, world } from "./inbox-world.ts";
import { until } from "./until.ts";

const SIGN_IN: ActionRequest = {
  title: "Sign in to the CLI",
  why: "The release needs your account.",
  steps: [{ text: "Run this in a terminal.", command: "gh auth login" }, { text: "Come back here." }],
};

const writer = createLogWriter({ fs: { read: async () => null, write: async () => {} }, now: () => new Date() });

/** The real bridge over `manager`, with the MCP on unless `enabled` says otherwise. */
function bridgeOver(manager: ChatManager, opts: { enabled?: boolean; actions?: boolean } = {}) {
  let ids = 0;
  return createAgentBridge({
    entry: null,
    enabled: async () => opts.enabled ?? true,
    chats: manager,
    writer,
    ...(opts.actions === false ? {} : { actions: createActionRequest({ chats: manager, newId: () => `${++ids}` }) }),
  });
}

const requests = (events: ChatEvent[]) =>
  events.filter((e): e is Extract<ChatEvent, { type: "approval" }> => e.type === "approval");

/** A chat mid-turn whose agent has called `request_action` with `request`: the call's answer, and the card. */
async function asking(w: ReturnType<typeof world>, request: unknown = SIGN_IN, dir = DIR) {
  const c = await w.chatCalling({ dir });
  const bridge = bridgeOver(w.manager);
  const answer = bridge.call(c.id, "action.request", request);
  // A refusal settles the call; it is read where the test awaits it.
  answer.catch(() => {});
  await until(() => requests(c.events).length === 1);
  const [card] = requests(c.events);
  return { c, answer, card: card! };
}

describe("AC2, AC3: the request is a card in the chat, and the agent waits for the answer", () => {
  it("shows the steps and commands, and Done is the call's answer", async () => {
    const w = world();
    const { c, answer, card } = await asking(w);
    expect(card).toEqual({
      type: "approval",
      id: "action-1",
      name: REQUEST_ACTION_TOOL,
      input: SIGN_IN,
      forChat: false,
    });
    let settled = false;
    void answer.then(() => (settled = true));
    // Nothing settles it but the user: the turn and the agent wait.
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(c.events.some((e) => e.type === "turn-end")).toBe(false);
    w.manager.approve(c.id, card.id, { choice: "allow" });
    await expect(answer).resolves.toEqual({ outcome: "done" });
    expect(c.events.at(-1)).toMatchObject({ type: "tool-allowed", id: card.id, name: REQUEST_ACTION_TOOL });
  });

  it("gives Can't do it with the user's reason, and without one when they gave none", async () => {
    const w = world();
    const first = await asking(w);
    w.manager.approve(first.c.id, first.card.id, { choice: "deny", reason: "I have no admin rights here." });
    await expect(first.answer).resolves.toEqual({ outcome: "cant", reason: "I have no admin rights here." });
    expect(first.c.events.at(-1)).toMatchObject({ type: "tool-denied", reason: "I have no admin rights here." });

    const second = await asking(w);
    w.manager.approve(second.c.id, second.card.id, { choice: "deny" });
    await expect(second.answer).resolves.toEqual({ outcome: "cant" });
  });

  it("cuts a long reason to the length a Deny reason is", async () => {
    const w = world();
    const { c, answer, card } = await asking(w);
    w.manager.approve(c.id, card.id, { choice: "deny", reason: "x".repeat(600) });
    await expect(answer).resolves.toEqual({ outcome: "cant", reason: "x".repeat(500) });
  });

  it("ends as cancelled, never as Can't do it, when the user stops the turn", async () => {
    const w = world();
    const { c, answer, card } = await asking(w);
    await w.manager.stop(c.id);
    c.run.say(sdk.failure());
    await expect(answer).rejects.toThrow(APPROVAL_CANCELLED);
    const ended = c.events.findIndex((e) => e.type === "turn-end");
    const cancelled = c.events.findIndex((e) => e.type === "approval-cancelled" && e.id === card.id);
    expect(cancelled).toBeGreaterThan(-1);
    // It ends before the turn does, so nothing shows it waiting after.
    expect(cancelled).toBeLessThan(ended);
    expect(() => w.manager.approve(c.id, card.id, { choice: "allow" })).toThrow(CHAT_MESSAGES.noRequest);
  });

  it("ends as cancelled when the chat's agent ends", async () => {
    const w = world();
    const { answer } = await asking(w);
    w.manager.close();
    await expect(answer).rejects.toThrow(APPROVAL_CANCELLED);
  });
});

describe("AC1: the call's input is checked", () => {
  it("refuses a request without steps, and asks nothing", async () => {
    const w = world();
    const c = await w.chatCalling();
    const bridge = bridgeOver(w.manager);
    await expect(bridge.call(c.id, "action.request", { title: "Sign in", steps: [] })).rejects.toThrow(
      ACTION_MESSAGES.badSteps,
    );
    expect(requests(c.events)).toEqual([]);
  });

  it("is refused when the MCP is off for the project, or the server can't ask", async () => {
    const w = world();
    const c = await w.chatCalling();
    await expect(bridgeOver(w.manager, { enabled: false }).call(c.id, "action.request", SIGN_IN)).rejects.toThrow(
      AGENT_MESSAGES.mcpOff,
    );
    await expect(bridgeOver(w.manager, { actions: false }).call(c.id, "action.request", SIGN_IN)).rejects.toThrow(
      AGENT_MESSAGES.noAction,
    );
  });
});

describe("AC4: like a tool approval, it goes to the Inbox after the wait, and is told as it arrives", () => {
  it("is in the Inbox only once it has waited the wait, and leaves it when answered", async () => {
    const w = world();
    const arrived: InboxItem[] = [];
    const stop = w.manager.watchAsked(DIR, (item) => arrived.push(item));
    const inbox = w.watch();
    const { c, card } = await asking(w);
    // Told as it is asked, as any approval is: the desktop notification comes from this.
    expect(arrived.map((i) => i.request)).toEqual([card]);
    w.clock.advance(WAIT - 1);
    expect(inbox.latest().items).toEqual([]);
    w.clock.advance(1);
    expect(inbox.latest().items.map((i) => i.request)).toEqual([card]);
    w.manager.approve(c.id, card.id, { choice: "allow" });
    await until(() => inbox.latest().items.length === 0);
    stop();
  });
});

describe("AC6: Featra never runs the command", () => {
  it("leaves the command unrun through the ask and the Done", async () => {
    const root = await mkdtemp(join(tmpdir(), "featra-action-"));
    try {
      const marker = join(root, "ran.txt");
      const command = `node -e "require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')"`;
      const w = world();
      const { c, answer, card } = await asking(w, { title: "Run it", steps: [{ text: "Run this.", command }] });
      w.manager.approve(c.id, card.id, { choice: "allow" });
      await answer;
      expect(existsSync(marker)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
