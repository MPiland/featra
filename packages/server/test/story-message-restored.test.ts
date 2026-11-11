/**
 * STORY-54 AC3 (ADR 0028): the Dev Lead can message a story session that was restored after a restart and not opened
 * yet: it is opened, and the message goes on in the saved provider session. The message module, the session manager,
 * the Claude adapter, the JSON store, the scanner and a real repository are real; faked are the SDK's `query`, the
 * folder Claude's session files live in, and the clock.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { leadMessage } from "@featra/work-format";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { fileChatStore } from "../src/chat-store.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { createStoryMessage } from "../src/story-message.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { claudeHome, sessionLines } from "./claude-sessions.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { tempFolder } from "./temp-folder.ts";
import { until } from "./until.ts";

let home: Awaited<ReturnType<typeof claudeHome>>;
let repo: CardRepo;
let data: Awaited<ReturnType<typeof tempFolder>>;
let scanner: ReturnType<typeof createScanner>;
const managers: ChatManager[] = [];

beforeAll(async () => {
  home = await claudeHome();
  repo = await cardRepo();
  scanner = createScanner(createRepoGit());
  await repo.write(repo.main, card("FEAT-2", "feature", null, "done"));
  await repo.write(repo.main, card("STORY-5", "story", "FEAT-2", "done"));
  repo.commit(repo.main, "plan");
});
afterAll(async () => {
  await scanner.close();
  await repo.dispose();
  await home.dispose();
});
beforeEach(async () => {
  data = await tempFolder();
});
afterEach(async () => {
  for (const m of managers.splice(0)) m.close();
  await data.dispose();
});

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

describe("message_session to a restored story session", () => {
  it("opens it and sends into the saved provider session, for the Dev Lead that started it", async () => {
    const session = sessionLines(repo.main).session;
    const first = app();
    const lead = await first.manager.start(repo.main, "developer");
    const { chat } = await first.manager.startStory({
      dir: repo.main,
      roleId: "developer",
      story: { id: "STORY-5", parent: lead, feature: "FEAT-2", featureTitle: "Delegation" },
      prepare: async () => ({ cwd: repo.main, first: "Do STORY-5.", undo: async () => {} }),
    });
    await until(() => (first.runs[0]?.heard.length ?? 0) === 1);
    first.runs[0]!.say(
      sdk.init("claude-sonnet-5-5", session),
      sdk.assistant("m1", [sdk.text("Done.")]),
      sdk.success("Done."),
    );
    await until(() => first.manager.list(repo.main).find((c) => c.id === chat)?.running === false);
    await sessionLines(repo.main, session)
      .prompt("Do STORY-5.")
      .reply("m1", [sdk.text("Done.")])
      .write();
    await first.manager.flush();
    first.manager.close();

    const second = app();
    await second.manager.ready();
    const message = createStoryMessage({ scan: scanner.scan, chats: second.manager });
    expect(second.manager.list(repo.main).find((c) => c.id === chat)).toMatchObject({ running: false });

    await expect(message.send(repo.main, { story: "STORY-5", text: "Now the tests." }, lead)).resolves.toEqual({
      story: "STORY-5",
    });
    await until(() => (second.runs[0]?.heard.length ?? 0) === 1);
    expect(second.runs[0]!.options.resume).toBe(session);
    expect(second.runs[0]!.heard[0]).toBe(leadMessage("Now the tests."));
  });
});
