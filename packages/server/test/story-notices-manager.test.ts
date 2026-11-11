/**
 * STORY-54 (review), through the real session manager and Claude adapter (only the Agent SDK is faked): a queued story
 * that fails to start tells its Dev Lead, and a message to a story session and Resume never put two messages in one turn.
 */
import { afterEach, describe, expect, it } from "vitest";
import { CHAT_MESSAGES, noticeMessage, RESUME_MESSAGE, type ChatEvent } from "@featra/work-format";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { until } from "./until.ts";

const DIR = "/home/me/demo";
const managers: ChatManager[] = [];
afterEach(() => {
  for (const m of managers.splice(0)) m.close();
});

function app(limit: () => Promise<number> = async () => 1) {
  const claude = fakeClaude();
  const manager = createChatManager({
    providers: [createClaudeProvider(claude.deps)],
    roles: createRoleRegistry(),
    storyLimit: limit,
  });
  managers.push(manager);
  const story = (id: string, parent: string | null, prepare: () => Promise<never> | Promise<unknown>) =>
    manager.startStory({
      dir: DIR,
      roleId: "developer",
      story: { id, parent, feature: "FEAT-2", featureTitle: "Delegation" },
      prepare: prepare as never,
    });
  return { ...claude, manager, story };
}

const prepared = (first: string) => async () => ({ cwd: DIR, first, undo: async () => {} });

describe("a queued story that fails to start", () => {
  it("tells its Dev Lead it failed, with why", async () => {
    const a = app();
    const lead = await a.manager.start(DIR, "developer");
    const seen: ChatEvent[] = [];
    a.manager.watch(lead, (e) => seen.push(e));

    const first = await a.story("STORY-5", null, prepared("Do 5."));
    await until(() => (a.runs[0]?.heard.length ?? 0) === 1);
    await a.story("STORY-6", lead, async () => {
      throw new Error("No room for a worktree.");
    });
    expect(a.manager.list(DIR).find((c) => c.story?.id === "STORY-6")).toMatchObject({ queued: true });

    // The first story's turn ends, its slot goes to the queued one, which can't start.
    a.runs[0]!.say(sdk.init(), sdk.success("Done."));
    await until(() => seen.some((e) => e.type === "user"));
    expect(first.chat).toBeDefined();
    expect(seen.filter((e) => e.type === "user")).toEqual([
      {
        type: "user",
        text: noticeMessage([{ story: "STORY-6", outcome: "failed", summary: "No room for a worktree." }]),
      },
    ]);
  });
});

/** A story session whose first turn has ended, with a session id saved: it can be resumed or messaged. */
async function idleStory(a: ReturnType<typeof app>) {
  const { chat } = await a.story("STORY-5", null, prepared("Do 5."));
  await until(() => (a.runs[0]?.heard.length ?? 0) === 1);
  a.runs[0]!.say(sdk.init("claude-sonnet-5-5", "session-1"), sdk.success("Done."));
  await until(() => a.manager.list(DIR)[0]?.running === false);
  return chat;
}

describe("a message to a story session and Resume, racing for one idle session", () => {
  it("lets the message sent while Resume does its card step have the turn: Resume is busy, not a second send", async () => {
    const a = app();
    const chat = await idleStory(a);

    await expect(
      a.manager.resume(chat, async () => {
        a.manager.send(chat, "From the Dev Lead.");
      }),
    ).rejects.toThrow(CHAT_MESSAGES.busy);

    await until(() => (a.runs[0]?.heard.length ?? 0) === 2);
    expect(a.runs[0]!.heard).toEqual(["Do 5.", "From the Dev Lead."]);
  });

  it("refuses a message while Resume is waiting to start its turn: one message in the turn", async () => {
    let hold: Promise<number> | null = null;
    let admitting = false;
    const a = app(async () => {
      if (!hold) return 1;
      admitting = true;
      return hold;
    });
    const chat = await idleStory(a);

    const gate: { resolve: (n: number) => void } = { resolve: () => {} };
    hold = new Promise<number>((resolve) => (gate.resolve = resolve));
    const resuming = a.manager.resume(chat);
    // Resume has claimed the turn and waits to be admitted: nothing has been sent yet.
    await until(() => admitting);
    expect(a.runs[0]!.heard).toEqual(["Do 5."]);
    expect(() => a.manager.send(chat, "From the Dev Lead.")).toThrow(CHAT_MESSAGES.busy);

    gate.resolve(1);
    await resuming;
    await until(() => (a.runs[0]?.heard.length ?? 0) === 2);
    expect(a.runs[0]!.heard).toEqual(["Do 5.", RESUME_MESSAGE]);
  });
});
