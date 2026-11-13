/**
 * STORY-13 AC1 and AC3 through the server's two sockets: the Dev Lead's `report_bug` puts the bug and Featra's
 * proposed place in front of the user in its chat; the user keeps or changes the place and Creates, or Cancels. Work's
 * New bug asks the window socket for the proposal, then files it. Real services, sockets, git and cards; only the
 * Agent SDK and the clock are faked.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BUG_COPY,
  CHAT_MESSAGES,
  REPORT_BUG_MESSAGES,
  REPORT_BUG_TOOL,
  type BugPlacements,
  type ChatEvent,
} from "@featra/work-format";
import { AGENT_MESSAGES, createAgentBridge } from "../src/agent-bridge.ts";
import { bugSubject } from "../src/bug-request.ts";
import { createLogWriter } from "../src/log-writer.ts";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld();
});
afterAll(() => w.close());

const CARDS = join(".featra", "cards");
const bugsOnMain = () =>
  readdirSync(join(w.dir, CARDS))
    .filter((n) => n.startsWith("BUG-"))
    .toSorted();
const approvals = (events: ChatEvent[]) =>
  events.filter((e): e is Extract<ChatEvent, { type: "approval" }> => e.type === "approval");
/** Whether a Dev Lead's run has heard a notice line containing `text`. */
const heard = (text: string) => w.claude.runs.some((r) => r.heard.some((h) => h.includes(text)));

describe("report_bug (AC1, AC3)", { timeout: 60_000 }, () => {
  it("asks the user with the proposed place, and Create with another place files it there", async () => {
    const lead = await w.devLead();
    const asked = await lead.agent.ask("bug.report", {
      title: "Spawn hangs",
      description: "Spawning six never returns.",
      cause: "story-6",
    });
    expect(asked).toMatchObject({ ok: true, result: { asked: true } });
    await w.until(() => approvals(lead.events()).length === 1);
    const [card] = approvals(lead.events());
    expect(card).toMatchObject({ name: REPORT_BUG_TOOL, story: bugSubject("Spawn hangs") });
    const input = card!.input as BugPlacements & { title: string; cause: string };
    expect(input).toMatchObject({ title: "Spawn hangs", cause: "STORY-6", proposed: "feature:FEAT-2" });
    expect(input.choices.map((c) => c.key)).toEqual(["feature:FEAT-2", "project"]);
    // Nothing is written until Create.
    expect(bugsOnMain()).toEqual([]);

    const answered = await w.window.ask("chat.approve", {
      id: lead.id,
      tool: card!.id,
      choice: "allow",
      option: "project",
    });
    expect(answered).toMatchObject({ ok: true });
    await w.until(() => bugsOnMain().length === 1, 20_000);
    expect(bugsOnMain()).toEqual(["BUG-1-spawn-hangs.md"]);
    await w.until(() => heard(`${bugSubject("Spawn hangs")} filed: BUG-1 on the project bug list.`));
  });

  it("refuses a place that wasn't offered, and keeps the card waiting", async () => {
    const lead = await w.devLead();
    await lead.agent.ask("bug.report", { title: "Odd place" });
    await w.until(() => approvals(lead.events()).length === 1);
    const [card] = approvals(lead.events());
    const answered = await w.window.ask("chat.approve", {
      id: lead.id,
      tool: card!.id,
      choice: "allow",
      option: "feature:FEAT-404",
    });
    expect(answered).toMatchObject({ ok: false, error: CHAT_MESSAGES.badOption });
    // Cancel then ends it, and nothing was filed.
    const before = bugsOnMain();
    expect(await w.window.ask("chat.approve", { id: lead.id, tool: card!.id, choice: "deny" })).toMatchObject({
      ok: true,
    });
    await w.until(() => heard(`${bugSubject("Odd place")} declined`));
    expect(bugsOnMain()).toEqual(before);
  });

  it("refuses a report without a title, or with a cause that isn't a card", async () => {
    const lead = await w.devLead();
    expect(await lead.agent.ask("bug.report", { description: "x" })).toMatchObject({
      ok: false,
      error: REPORT_BUG_MESSAGES.badTitle,
    });
    expect(await lead.agent.ask("bug.report", { title: "T", cause: "STORY-404" })).toMatchObject({
      ok: false,
      error: REPORT_BUG_MESSAGES.unknownCause("STORY-404"),
    });
  });
});

describe("New bug in Work (AC1, AC3)", { timeout: 60_000 }, () => {
  it("proposes a place for the cause, and files at the place the user confirmed", async () => {
    const proposed = await w.window.ask("bug.propose", { dir: w.dir, cause: "FEAT-2" });
    expect(proposed).toMatchObject({ ok: true, result: { proposed: "feature:FEAT-2" } });
    expect((proposed.result as BugPlacements).choices).toContainEqual({ key: "project", label: BUG_COPY.project });
    const filed = await w.window.ask("bug.file", {
      dir: w.dir,
      title: "Lost focus",
      description: "",
      cause: "FEAT-2",
      placement: "feature:FEAT-2",
    });
    expect(filed).toMatchObject({ ok: true, result: { kind: "card" } });
    const id = (filed.result as { id: string }).id;
    const card = w.repo.git(w.dir, "ls-tree", "--name-only", `feature/2-delegation:.featra/cards`);
    expect(card.split("\n")).toContain(`${id}-lost-focus.md`);
  });

  it("refuses a title too long, before anything is written", async () => {
    const before = bugsOnMain();
    const filed = await w.window.ask("bug.file", {
      dir: w.dir,
      title: "x".repeat(121),
      description: "",
      cause: null,
      placement: "project",
    });
    expect(filed).toMatchObject({ ok: false, error: REPORT_BUG_MESSAGES.longTitle });
    expect(bugsOnMain()).toEqual(before);
  });
});

describe("bug.report on the agent bridge", () => {
  const writer = createLogWriter({ fs: { read: async () => null, write: async () => {} }, now: () => new Date() });
  const bridge = createAgentBridge({
    entry: null,
    enabled: async () => true,
    knowledge: async () => "propose",
    chats: {
      info: (id) => (id === "lead" ? { dir: "/p", session: "Dev Lead" } : { dir: "/p", session: "Story", story: true }),
      report: () => {},
      retitle: () => {},
    },
    writer,
  });

  it("is refused to a story session, which tells the Dev Lead instead", async () => {
    await expect(bridge.call("story", "bug.report", { title: "T" })).rejects.toThrow(AGENT_MESSAGES.sessionBug);
  });

  it("says so when the server can't file bugs", async () => {
    await expect(bridge.call("lead", "bug.report", { title: "T" })).rejects.toThrow(AGENT_MESSAGES.noBug);
  });
});
