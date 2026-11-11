/**
 * STORY-53 (review): Resume after the server restarts. The session manager, Claude adapter, JSON store and the SDK's real
 * session reader are real; faked are the SDK's `query`, the folder Claude's session files live in, the clock, and the
 * worktree the spawner would make (the session works in the project's own folder).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RESUME_MESSAGE } from "@featra/work-format";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { fileChatStore } from "../src/chat-store.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { claudeHome, projectFolder, sessionLines } from "./claude-sessions.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { tempFolder } from "./temp-folder.ts";
import { until } from "./until.ts";

let home: Awaited<ReturnType<typeof claudeHome>>;
let project: Awaited<ReturnType<typeof projectFolder>>;
let data: Awaited<ReturnType<typeof tempFolder>>;
const managers: ChatManager[] = [];

beforeAll(async () => {
  home = await claudeHome();
  project = await projectFolder();
});
afterAll(async () => {
  await project.dispose();
  await home.dispose();
});
beforeEach(async () => {
  data = await tempFolder();
});
afterEach(async () => {
  for (const m of managers.splice(0)) m.close();
  await data.dispose();
});

/** The app, started (or started again) on the same data folder. */
function app() {
  const claude = fakeClaude();
  const manager = createChatManager({
    providers: [createClaudeProvider(claude.deps)],
    roles: createRoleRegistry(),
    store: fileChatStore(data.dir),
    now: () => new Date("2026-11-11T10:00:00.000Z"),
  });
  managers.push(manager);
  return { ...claude, manager };
}

/** A story session started in the project's folder, with the agent's first message sent. */
async function story(first: ReturnType<typeof app>) {
  const { chat } = await first.manager.startStory({
    dir: project.dir,
    roleId: "developer",
    story: { id: "STORY-5", parent: null, feature: "FEAT-2", featureTitle: "Delegation" },
    prepare: async () => ({ cwd: project.dir, first: "Do STORY-5.", undo: async () => {} }),
  });
  await until(() => (first.runs[0]?.heard.length ?? 0) === 1);
  return chat;
}

/** Ends the app: its chats are saved first, as they are whenever something changes. */
async function shutDown(first: ReturnType<typeof app>) {
  await first.manager.flush();
  first.manager.close();
}

describe("Resume after a restart", () => {
  it("opens the saved session and sends the next turn into it with the saved session id", async () => {
    const session = sessionLines(project.dir).session;
    const first = app();
    const chat = await story(first);
    first.runs[0]!.say(sdk.init("claude-sonnet-5-5", session), sdk.assistant("m1", [sdk.text("Working.")]));
    await until(() => first.manager.list(project.dir)[0]?.running === true);
    await first.manager.stop(chat);
    first.runs[0]!.say(sdk.failure());
    await until(() => first.manager.list(project.dir)[0]?.running === false);
    await sessionLines(project.dir, session)
      .prompt("Do STORY-5.")
      .reply("m1", [sdk.text("Working.")])
      .write();
    await shutDown(first);

    const second = app();
    await second.manager.ready();
    await second.manager.resume(chat);
    await until(() => (second.runs[0]?.heard.length ?? 0) === 1);
    expect(second.runs[0]!.options.resume).toBe(session);
    expect(second.runs[0]!.heard[0]).toBe(RESUME_MESSAGE);
    expect(second.manager.list(project.dir)[0]).toMatchObject({ running: true });
  });

  it("can resume a story stopped while the agent was only thinking: its session id was saved", async () => {
    const session = sessionLines(project.dir).session;
    const first = app();
    const chat = await story(first);
    first.runs[0]!.say(sdk.init("claude-sonnet-5-5", session), sdk.start("m1"), {
      parent_tool_use_id: null,
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Let me see." } },
    });
    await until(() => first.manager.list(project.dir)[0]?.running === true);
    await until(() => first.manager.watch(chat, () => {}).events.some((e) => e.type === "thinking"));
    await first.manager.stop(chat);
    first.runs[0]!.say(sdk.failure());
    await until(() => first.manager.list(project.dir)[0]?.running === false);
    await sessionLines(project.dir, session).prompt("Do STORY-5.").write();
    await shutDown(first);

    const second = app();
    await second.manager.ready();
    await second.manager.resume(chat);
    await until(() => (second.runs[0]?.heard.length ?? 0) === 1);
    expect(second.runs[0]!.options.resume).toBe(session);
  });
});

describe("a session cut off by a restart", () => {
  it("comes back stalled, and Resume goes on in its session", async () => {
    const session = sessionLines(project.dir).session;
    const first = app();
    const chat = await story(first);
    first.runs[0]!.say(sdk.init("claude-sonnet-5-5", session), sdk.assistant("m1", [sdk.text("Working.")]));
    await until(() => first.manager.list(project.dir)[0]?.running === true);
    await sessionLines(project.dir, session)
      .prompt("Do STORY-5.")
      .reply("m1", [sdk.text("Working.")])
      .write();
    // The app goes away mid-turn: nothing ended the turn.
    await first.manager.flush();
    first.manager.close();

    const second = app();
    await second.manager.ready();
    expect(second.manager.list(project.dir)[0]).toMatchObject({ id: chat, running: false, stalled: true });
    await second.manager.resume(chat);
    await until(() => (second.runs[0]?.heard.length ?? 0) === 1);
    expect(second.runs[0]!.options.resume).toBe(session);
    expect(second.manager.list(project.dir)[0]?.stalled).toBeUndefined();
  });
});
