/**
 * STORY-53 AC4: a stopped session does not count toward the running-sessions cap, and Resume takes a slot or waits
 * Queued like any turn; a Queued turn can be stopped too. Also the provider-neutral refusal of Resume. Real services,
 * sockets and git; only the Agent SDK and the clock are faked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHAT_MESSAGES, RESUME_MESSAGE } from "@featra/work-format";
import { createChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { DIR } from "./chat-fixture.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld({ config: "maxStoryAgents: 1\n" });
});
afterAll(() => w.close());

const ask = (method: string, id: string) => w.window.ask(method, { dir: w.repo.main, id });
const sessionOf = async (id: string) => (await w.sessions()).find((c) => c.story?.id === id);
async function eventually(ok: () => Promise<boolean>) {
  const end = Date.now() + 10_000;
  while (!(await ok())) {
    if (Date.now() > end) throw new Error("Not seen in 10 s");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("AC4: the cap", () => {
  it("frees the slot of a stopped session, so the next story starts", async () => {
    expect(await ask("story.start", "STORY-5")).toMatchObject({ ok: true, result: { queued: false } });
    await w.until(() => w.claude.runs.length === 1);
    const first = w.claude.runs[0]!;
    await w.until(() => first.heard.length === 1);
    first.say(sdk.init("claude-sonnet-5-5", "session-5"));
    // The cap is one, and it is taken: the next story waits.
    expect(await ask("story.start", "STORY-6")).toMatchObject({ ok: true, result: { queued: true } });
    expect(w.claude.runs).toHaveLength(1);

    expect(await ask("story.stop", "STORY-5")).toMatchObject({ ok: true });
    first.say(sdk.failure());
    await w.until(() => w.claude.runs.length === 2);
    expect((await sessionOf("STORY-6"))?.queued).toBeFalsy();
    expect((await sessionOf("STORY-5"))?.running).toBe(false);
  });

  it("makes Resume wait Queued while the slot is taken, and run when it frees", async () => {
    const first = w.claude.runs[0]!;
    const second = w.claude.runs[1]!;
    await w.until(() => second.heard.length === 1);
    expect(await ask("story.resume", "STORY-5")).toMatchObject({ ok: true });
    expect((await sessionOf("STORY-5"))?.queued).toBe(true);
    expect(first.heard).toHaveLength(1);

    second.say(sdk.init("claude-sonnet-5-5", "session-6"), sdk.success("done"));
    await w.until(() => first.heard.length === 2);
    expect(first.heard[1]).toBe(RESUME_MESSAGE);
    expect((await sessionOf("STORY-5"))?.queued).toBeFalsy();
  });

  it("stops a turn that is waiting Queued: nothing is interrupted, the turn ends stopped, and the card is marked", async () => {
    const first = w.claude.runs[0]!;
    const second = w.claude.runs[1]!;
    // STORY-5 is running again; its next turn waits behind STORY-6's.
    first.say(sdk.success("done"));
    await eventually(async () => (await sessionOf("STORY-5"))?.running === false);
    const chat = (await sessionOf("STORY-6"))!.id;
    await w.window.ask("chat.send", { id: chat, text: "More." });
    await w.until(() => second.heard.length === 2);
    const queued = await w.window.ask("chat.send", { id: (await sessionOf("STORY-5"))!.id, text: "Again." });
    expect(queued).toMatchObject({ ok: true });
    await eventually(async () => (await sessionOf("STORY-5"))?.queued === true);

    expect(await ask("story.stop", "STORY-5")).toMatchObject({ ok: true });
    expect(first.interrupts).toBe(1);
    expect((await sessionOf("STORY-5"))?.queued).toBeFalsy();
    expect((await sessionOf("STORY-5"))?.running).toBe(false);
    expect(await ask("story.stop", "STORY-5")).toMatchObject({ ok: false, error: "STORY-5 is already stopped." });
  });
});

describe("a provider that can't resume", () => {
  it("refuses Resume with a clear message and changes nothing", async () => {
    const { resumes: _gone, ...fixed } = createClaudeProvider(fakeClaude().deps);
    const manager = createChatManager({ providers: [fixed], roles: createRoleRegistry() });
    try {
      const chat = { id: await manager.start(DIR, "developer") };
      await expect(manager.resume(chat.id)).rejects.toThrow(CHAT_MESSAGES.noResume);
    } finally {
      manager.close();
    }
  });
});
