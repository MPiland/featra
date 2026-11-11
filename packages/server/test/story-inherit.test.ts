/**
 * STORY-9 (review): a session inherits its Dev Lead's permissions when it launches, not when it was queued, and from a
 * lead chat that is listed but not yet loaded (restored after a restart) as well. Real services and session manager;
 * only the Agent SDK and the clock are faked.
 */
import type { PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";
import type { SavedChats } from "@featra/work-format";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import type { ChatStore } from "../src/chat-store.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { DIR } from "./chat-fixture.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";
import { until } from "./until.ts";

const RULE: PermissionUpdate = {
  type: "addRules",
  rules: [{ toolName: "Bash", ruleContent: "npm test" }],
  behavior: "allow",
  destination: "localSettings",
};

describe("rules at launch time", () => {
  let w: StoryWorld;
  beforeAll(async () => {
    w = await storyWorld({ config: "maxStoryAgents: 1\n" });
  });
  afterAll(() => w.close());

  it("gives a queued session the rules its lead has when it launches, not those it had when it queued", async () => {
    const lead = await w.runningLead();
    const first = await w.spawnAs(lead, "STORY-5");

    // STORY-6 queues behind STORY-5: no rule exists yet.
    lead.agent.socket.send({ id: 7, method: "story.spawn", params: { story: "STORY-6" } });
    expect(await lead.agent.socket.next((f) => f.id === 7, 20_000)).toMatchObject({
      ok: true,
      result: { queued: true },
    });

    // The lead is given an always-allow rule for the chat while it waits.
    lead.run.say(sdk.init());
    const asked = lead.run.ask("Bash", { command: "npm test" }, "t1", { suggestions: [RULE] });
    await w.until(() => lead.events().some((e) => e.type === "approval"));
    await w.window.ask("chat.approve", { id: lead.id, tool: "t1", choice: "allow-chat" });
    await asked;

    const before = w.claude.runs.length;
    first.run.say(sdk.init(), sdk.success("done"));
    await w.until(() => (w.claude.runs[before]?.heard.length ?? 0) === 1);
    expect(w.claude.runs[before]!.options.allowedTools).toEqual(
      expect.arrayContaining(["mcp__featra", "Bash(npm test)"]),
    );
  });
});

describe("a lead chat that is listed but not loaded", () => {
  const managers: ChatManager[] = [];
  afterEach(() => {
    for (const m of managers.splice(0)) m.close();
  });

  const app = (store: ChatStore, claude = fakeClaude()) => {
    const manager = createChatManager({
      providers: [createClaudeProvider(claude.deps)],
      roles: createRoleRegistry(),
      store,
    });
    managers.push(manager);
    return { ...claude, manager };
  };

  it("loads the lead's settings and starts the session in its permission mode", async () => {
    let kept: SavedChats = { version: 1, chats: [] };
    const store: ChatStore = {
      load: async () => kept,
      save: async (next) => {
        kept = next;
      },
    };
    const first = app(store);
    const lead = await first.manager.start(DIR, "dev-lead");
    await first.manager.open(lead);
    await first.manager.configure(lead, { mode: "acceptEdits" });
    await first.manager.flush();
    first.manager.close();

    // After a restart the lead is listed, its transcript and settings not yet read.
    const second = app(store);
    await second.manager.ready();
    expect(second.manager.list(DIR).map((c) => c.id)).toContain(lead);
    await second.manager.startStory({
      dir: DIR,
      roleId: "developer",
      story: { id: "STORY-5", parent: lead, feature: "FEAT-2", featureTitle: "Delegation" },
      prepare: async () => ({ cwd: DIR, first: "go", undo: async () => {} }),
    });
    await until(() => second.runs.length > 0);
    expect(second.runs[0]!.options.permissionMode).toBe("acceptEdits");
  });
});
