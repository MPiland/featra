/** STORY-7: a chat manager with the server's clock and timers in the test's hands, for the Inbox tests. */
import { afterEach } from "vitest";
import { type ChatEvent, type Inbox, type Question } from "@featra/work-format";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { DIR } from "./chat-fixture.ts";
import { fakeClaude, sdk, type FakeRun } from "./fake-query.ts";
import { manualClock, MINUTE } from "./manual-clock.ts";
import { until } from "./until.ts";

export const managers: ChatManager[] = [];
afterEach(() => managers.splice(0).forEach((m) => m.close()));

export const BASH = { command: "npm test" };
export const WAIT = 10 * MINUTE;
export const COLOUR: Question = {
  question: "Which colour?",
  header: "Colour",
  options: [
    { label: "Blue", description: "Calm" },
    { label: "Red", description: "Loud" },
  ],
  multiSelect: false,
};

/** A manager with the server's clock in the test's hands. */
export function world() {
  const clock = manualClock();
  const claude = fakeClaude();
  const manager = createChatManager({
    providers: [createClaudeProvider(claude.deps)],
    roles: createRoleRegistry(),
    now: clock.now,
    timers: clock.timers,
  });
  managers.push(manager);

  /** A chat whose agent has just called `name`, about to ask. */
  async function chatCalling(opts: { card?: string; dir?: string; message?: string } = {}) {
    const id = await manager.start(opts.dir ?? DIR, "developer", opts.card);
    const events: ChatEvent[] = [];
    manager.watch(id, (e) => events.push(e));
    const n = claude.runs.length;
    manager.send(id, opts.message ?? "go");
    await until(() => claude.runs.length > n && (claude.runs[n]?.heard.length ?? 0) > 0);
    const run = claude.runs[n] as FakeRun;
    run.say(sdk.init());
    return {
      id,
      run,
      events,
      /** The agent calls the tool and the chat asks the user. */
      async askApproval(toolId = "t1") {
        run.say(sdk.assistant(`m-${toolId}`, [sdk.toolUse(toolId, "Bash", BASH)]));
        await until(() => events.some((e) => e.type === "tool" && e.id === toolId));
        const answer = run.ask("Bash", BASH, toolId);
        await until(() => events.some((e) => e.type === "approval" && e.id === toolId));
        return { answer };
      },
      async askQuestion(toolId = "q1") {
        run.say(sdk.assistant(`m-${toolId}`, [sdk.toolUse(toolId, "AskUserQuestion", { questions: [COLOUR] })]));
        await until(() => events.some((e) => e.type === "tool" && e.id === toolId));
        const answer = run.ask("AskUserQuestion", { questions: [COLOUR] }, toolId);
        await until(() => events.some((e) => e.type === "question" && e.id === toolId));
        return { answer };
      },
    };
  }

  /** An Inbox watch at `wait`: the answer, and each push after it. */
  function watch(wait = WAIT, dir = DIR) {
    const pushes: Inbox[] = [];
    const { inbox, stop } = manager.watchInbox(dir, wait, (i) => pushes.push(i));
    return { first: inbox, pushes, stop, latest: () => pushes.at(-1) ?? inbox };
  }
  return { clock, claude, manager, chatCalling, watch };
}

export const ids = (inbox: Inbox) => inbox.items.map((i) => `${i.chat}:${i.request.id}`);
