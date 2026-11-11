/**
 * STORY-9 AC6: spawning goes through the provider interface. A provider with no runner for story sessions, or no
 * provider at all, refuses with a clear message, and nothing is prepared. Through the real session manager.
 */
import { afterEach, describe, expect, it } from "vitest";
import { CHAT_MESSAGES } from "@featra/work-format";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { DIR } from "./chat-fixture.ts";
import { fakeClaude } from "./fake-query.ts";

const managers: ChatManager[] = [];
afterEach(() => {
  for (const m of managers.splice(0)) m.close();
});

const story = { id: "STORY-5", parent: null, feature: "FEAT-2", featureTitle: "Delegation" };

function spawnWith(providers: ReturnType<typeof createClaudeProvider>[]) {
  let prepared = 0;
  const manager = createChatManager({ providers, roles: createRoleRegistry() });
  managers.push(manager);
  const attempt = manager.startStory({
    dir: DIR,
    roleId: "developer",
    story,
    prepare: async () => {
      prepared++;
      return { cwd: DIR, first: "go" };
    },
  });
  return { attempt, prepared: () => prepared, manager };
}

describe("AC6: a provider that can't run story sessions", () => {
  it("refuses a provider with no worktree location, makes nothing, and leaves no chat behind", async () => {
    const claude = createClaudeProvider(fakeClaude().deps);
    const { worktrees: _gone, ...runnerless } = claude;
    const run = spawnWith([runnerless]);
    await expect(run.attempt).rejects.toThrow(CHAT_MESSAGES.noRunner);
    expect(run.prepared()).toBe(0);
    expect(run.manager.list(DIR)).toEqual([]);
  });

  it("refuses a role whose provider isn't there at all", async () => {
    const run = spawnWith([]);
    await expect(run.attempt).rejects.toThrow(CHAT_MESSAGES.noProvider);
    expect(run.prepared()).toBe(0);
  });

  it("starts for the Claude adapter, which keeps its worktrees under .claude/worktrees", async () => {
    const claude = createClaudeProvider(fakeClaude().deps);
    expect(claude.worktrees?.folder("/repo", "STORY-5-x")).toMatch(/\.claude[\\/]worktrees[\\/]STORY-5-x$/);
    expect(claude.worktrees?.ignore).toBe(".claude/worktrees/");
    const run = spawnWith([claude]);
    await expect(run.attempt).resolves.toMatchObject({ queued: false });
    expect(run.prepared()).toBe(1);
  });
});
