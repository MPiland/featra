/**
 * STORY-71 through the real chat manager and Claude adapter (only the Agent SDK and the clock are faked): "Not yet"
 * sends the reason to the feature's Dev Lead chat as the user's message, then logs it in the feature's history on its
 * branch; the Dev Lead's reply and the user's Dismiss end the round. Real scanner, card lane and git.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CHANGES_MESSAGES,
  CHANGES_REFUSALS,
  CHAT_MESSAGES,
  changesOf,
  DRAFTED_BY,
  foldChat,
  parseCard,
  type Card,
  type ChatEvent,
} from "@featra/work-format";
import { createCardLane } from "../src/card-lane.ts";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createFeatureChanges } from "../src/feature-changes.ts";
import { createFeatureStart } from "../src/feature-start.ts";
import { runGit } from "../src/git-run.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, withIdentity, type CardRepo } from "./card-repo.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { until } from "./until.ts";

const NOW = "2026-11-10T09:30:00Z";
let scanner: ReturnType<typeof createScanner>;
let repo: CardRepo;
let manager: ChatManager;
let claude: ReturnType<typeof fakeClaude>;
let lead = "";
let branch = "";
let events: ChatEvent[];
let changes: ReturnType<typeof createFeatureChanges>;

/** A busy git: the branch can't take a commit, so a record fails after the chat took the message. */
const busy: typeof runGit = (command, dir, args, options) =>
  args[0] === "update-ref"
    ? Promise.resolve({ code: 1, stdout: "", stderr: "busy" })
    : runGit(command, dir, args, options);

/** A feature started on its branch, drafted by `drafter` (or by nobody), with STORY-1 under it. */
async function started(drafter: string | null) {
  const extra = drafter ? { extra: { [DRAFTED_BY]: drafter } } : {};
  await repo.write(repo.main, card("FEAT-1", "feature", null, "approved", extra));
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready"));
  repo.commit(repo.main, "plan");
  const start = createFeatureStart({ scan: scanner.scan, now: () => new Date(NOW) });
  branch = (await start.start(repo.main, "FEAT-1", "user")).branch;
}

beforeEach(async () => {
  scanner = createScanner(createRepoGit());
  repo = await cardRepo();
  withIdentity(repo);
  claude = fakeClaude();
  manager = createChatManager({
    providers: [createClaudeProvider(claude.deps)],
    roles: createRoleRegistry(),
    store: { load: async () => ({ version: 1, chats: [] }), save: async () => {} },
  });
  lead = await manager.start(repo.main, "dev-lead");
  events = [];
  manager.watch(lead, (e) => events.push(e));
  changes = createFeatureChanges({
    scan: scanner.scan,
    now: () => new Date(NOW),
    lane: createCardLane(),
    chats: manager,
  });
});
afterEach(async () => {
  manager.close();
  await scanner.close();
  await repo.dispose();
});

const onBranch = (): Card => parseCard(repo.show(repo.main, branch, "FEAT-1"));
const userTexts = () => foldChat(events).items.flatMap((e) => (e.kind === "user" ? [e.text] : []));
/** The Dev Lead's turn ends, as the agent's answer to the message does. */
async function turnEnds() {
  claude.runs[0]?.say(sdk.init(), sdk.success("On it."));
  await until(() => manager.list(repo.main).find((c) => c.id === lead)?.running === false);
}

describe("Not yet (STORY-71 AC1, AC2)", () => {
  beforeEach(() => started(lead));

  it("sends the reason to the Dev Lead's chat as the user's message, then logs it in the feature's history", async () => {
    expect(await changes.ask(repo.main, "FEAT-1", "Rename Save to Keep.")).toEqual({ recorded: true });
    const expected = "Changes asked on FEAT-1: Rename Save to Keep.";
    expect(userTexts()).toEqual([expected]);
    await until(() => (claude.runs[0]?.heard.length ?? 0) > 0);
    expect(claude.runs[0]?.heard).toEqual([expected]);
    const feature = onBranch();
    expect(feature.history.at(-1)).toEqual({
      at: NOW,
      field: "changes-asked",
      from: null,
      to: "Rename Save to Keep.",
      by: "user",
    });
    expect(changesOf(feature)).toEqual({ asked: [{ text: "Rename Save to Keep.", at: NOW }], reply: null });
    expect(repo.git(repo.main, "log", "-1", "--format=%s", branch)).toBe("FEAT-1: changes asked");
  });

  it("refuses an empty reason: nothing is sent or logged", async () => {
    const before = onBranch().history;
    await expect(changes.ask(repo.main, "FEAT-1", "   ")).rejects.toThrow(CHANGES_REFUSALS.noReason);
    expect(userTexts()).toEqual([]);
    expect(onBranch().history).toEqual(before);
  });

  it("is refused as a normal send is while the Dev Lead is mid-turn: nothing is logged", async () => {
    await changes.ask(repo.main, "FEAT-1", "First.");
    const before = onBranch().history;
    await expect(changes.ask(repo.main, "FEAT-1", "Second.")).rejects.toThrow(CHAT_MESSAGES.busy);
    expect(onBranch().history).toEqual(before);
    expect(userTexts()).toHaveLength(1);
  });

  it("adds a reason asked again while changes are asked to the same round", async () => {
    await changes.ask(repo.main, "FEAT-1", "First.");
    await turnEnds();
    await changes.ask(repo.main, "FEAT-1", "Second.");
    expect(userTexts()).toEqual(["Changes asked on FEAT-1: First.", "Changes asked on FEAT-1: Second."]);
    expect(changesOf(onBranch())?.asked.map((n) => n.text)).toEqual(["First.", "Second."]);
  });

  it("is refused when the Dev Lead's chat is gone with its project: nothing is logged", async () => {
    const before = onBranch().history;
    manager.closeProjects(() => false);
    await expect(changes.ask(repo.main, "FEAT-1", "Too big.")).rejects.toThrow(CHANGES_REFUSALS.leadGone);
    expect(onBranch().history).toEqual(before);
  });

  it("answers not recorded when the feature's branch goes between the send and the record: the chat has the reason once", async () => {
    // The branch is deleted once the chat took the message, before the record reads the card.
    const send: ChatManager["send"] = (id, text) => {
      manager.send(id, text);
      repo.git(repo.main, "branch", "-D", branch);
    };
    const racing = createFeatureChanges({
      scan: scanner.scan,
      now: () => new Date(NOW),
      chats: { list: manager.list, dirOf: manager.dirOf, open: manager.open, send },
    });
    expect(await racing.ask(repo.main, "FEAT-1", "Rename Save to Keep.")).toEqual({ recorded: false });
    expect(userTexts()).toEqual(["Changes asked on FEAT-1: Rename Save to Keep."]);
    expect(repo.git(repo.main, "branch", "--list", branch)).toBe("");
    const onMain = parseCard(repo.show(repo.main, "main", "FEAT-1"));
    expect(onMain.history.some((e) => e.field === "changes-asked")).toBe(false);
    // The screen shows no round, so the Dev Lead's reply is refused, saying why.
    await expect(changes.handled(repo.main, { feature: "FEAT-1", reply: "Renamed it." }, lead)).rejects.toThrow(
      CHANGES_REFUSALS.notActive("FEAT-1"),
    );
  });

  it("answers not recorded when git refuses the record after the send, and the Dev Lead's reply is told why", async () => {
    const refusing = createFeatureChanges({
      scan: scanner.scan,
      now: () => new Date(NOW),
      chats: manager,
      gitRun: busy,
    });
    const before = onBranch().history;
    expect(await refusing.ask(repo.main, "FEAT-1", "Rename Save to Keep.")).toEqual({ recorded: false });
    expect(userTexts()).toEqual(["Changes asked on FEAT-1: Rename Save to Keep."]);
    expect(onBranch().history).toEqual(before);
    await expect(changes.handled(repo.main, { feature: "FEAT-1", reply: "Renamed it." }, lead)).rejects.toThrow(
      CHANGES_MESSAGES.nothingAsked("FEAT-1"),
    );
    expect(CHANGES_MESSAGES.nothingAsked("FEAT-1")).toContain("wasn't recorded");
  });

  it("is refused for a feature that isn't in progress", async () => {
    await expect(changes.ask(repo.main, "FEAT-9", "Rename it.")).rejects.toThrow(CHANGES_REFUSALS.notActive("FEAT-9"));
  });
});

describe("a feature without a live Dev Lead chat (STORY-71 AC1)", () => {
  it("is refused when nobody drafted it and no Dev Lead started its stories: nothing is logged", async () => {
    await started(null);
    const before = onBranch().history;
    await expect(changes.ask(repo.main, "FEAT-1", "Rename it.")).rejects.toThrow(CHANGES_REFUSALS.noLead);
    expect(onBranch().history).toEqual(before);
  });

  it("is refused when the chat that drafted it isn't one Featra has", async () => {
    await started("chat-lost");
    await expect(changes.ask(repo.main, "FEAT-1", "Rename it.")).rejects.toThrow(CHANGES_REFUSALS.leadGone);
  });
});

describe("handled and dismissed (STORY-71 AC3, AC4)", () => {
  beforeEach(async () => {
    await started(lead);
    await changes.ask(repo.main, "FEAT-1", "Rename Save to Keep.");
  });

  it("logs the Dev Lead's reply by its session, which ends the round", async () => {
    const answer = await changes.handled(repo.main, { feature: "FEAT-1", reply: "Renamed it." }, lead);
    expect(answer).toEqual({ feature: "FEAT-1", message: CHANGES_MESSAGES.handled("FEAT-1") });
    const feature = onBranch();
    expect(feature.history.at(-1)).toMatchObject({
      field: "changes-handled",
      to: "Renamed it.",
      by: `session:${lead}`,
    });
    expect(changesOf(feature)?.reply).toEqual({ text: "Renamed it.", at: NOW });
  });

  it("logs the user's Dismiss, which clears the changes asked; a second Dismiss is refused", async () => {
    await changes.dismiss(repo.main, "FEAT-1");
    const feature = onBranch();
    expect(feature.history.at(-1)).toMatchObject({ field: "changes-dismissed", to: null, by: "user" });
    expect(changesOf(feature)).toBeNull();
    expect(repo.git(repo.main, "log", "-1", "--format=%s", branch)).toBe("FEAT-1: changes dismissed");
    await expect(changes.dismiss(repo.main, "FEAT-1")).rejects.toThrow(CHANGES_REFUSALS.nothingAsked);
  });

  it("refuses the Dev Lead's reply once the user dismissed the changes, and Dismiss once they are handled", async () => {
    await changes.dismiss(repo.main, "FEAT-1");
    await expect(changes.handled(repo.main, { feature: "FEAT-1", reply: "Late." }, lead)).rejects.toThrow(
      CHANGES_MESSAGES.nothingAsked("FEAT-1"),
    );
    await turnEnds();
    await changes.ask(repo.main, "FEAT-1", "Again.");
    await changes.handled(repo.main, { feature: "FEAT-1", reply: "Done." }, lead);
    await expect(changes.dismiss(repo.main, "FEAT-1")).rejects.toThrow(CHANGES_REFUSALS.nothingAsked);
  });

  it("refuses the reply of a Dev Lead chat that doesn't lead the feature: nothing is logged", async () => {
    const other = await manager.start(repo.main, "dev-lead");
    const before = onBranch().history;
    await expect(changes.handled(repo.main, { feature: "FEAT-1", reply: "Mine." }, other)).rejects.toThrow(
      CHANGES_MESSAGES.notLead("FEAT-1"),
    );
    expect(onBranch().history).toEqual(before);
  });

  it("keeps exactly one of a reply and a Dismiss made at once", async () => {
    const outcomes = await Promise.allSettled([
      changes.dismiss(repo.main, "FEAT-1"),
      changes.handled(repo.main, { feature: "FEAT-1", reply: "Renamed it." }, lead),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const ends = onBranch().history.filter((e) => e.field === "changes-dismissed" || e.field === "changes-handled");
    expect(ends).toHaveLength(1);
  });
});
