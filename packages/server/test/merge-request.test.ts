/**
 * STORY-12 AC3: the Dev Lead's `request_merge`. The real request and merge modules (and the agent bridge for who may
 * call it) on a real repository in local mode; the chat manager, which shows the approval card and the notices, is
 * faked. The call answers once the user is asked; how it ends reaches the Dev Lead as a notice.
 */
import { afterEach, describe, expect, it } from "vitest";
import { isMerged, MERGE_MESSAGES, parseCard, REQUEST_MERGE_MESSAGES, REQUEST_MERGE_TOOL } from "@featra/work-format";
import { AGENT_MESSAGES, createAgentBridge } from "../src/agent-bridge.ts";
import { createLogWriter } from "../src/log-writer.ts";
import { createMergeRequest } from "../src/merge-request.ts";
import { chat, closeChats } from "./chat-fixture.ts";
import { until } from "./until.ts";
import { FEATURE_BRANCH, LEAD, mergeWorld, STORY_BRANCH } from "./story-merge-world.ts";

const m = mergeWorld();
const { w } = m;
const ask = (lead = LEAD) => m.requests.request(w.repo.main, { story: "STORY-1" }, lead);
/** Waits until the Dev Lead has had `n` notices. */
async function notices(n: number) {
  for (let i = 0; i < 200 && m.notices.length < n; i++) await new Promise((r) => setTimeout(r, 25));
  return m.notices;
}

describe("request_merge (AC3)", { timeout: 60_000 }, () => {
  it("puts an approval card in front of the user in the Dev Lead's chat, and approving merges", async () => {
    await m.start({ remote: false });
    await m.verified();
    await expect(ask()).resolves.toEqual({ story: "STORY-1" });
    expect(m.asked).toHaveLength(1);
    expect(m.asked[0]).toMatchObject({
      chat: LEAD,
      request: { name: REQUEST_MERGE_TOOL, input: { story: "STORY-1", into: FEATURE_BRANCH }, story: "STORY-1" },
    });
    expect(m.hasBranch(STORY_BRANCH)).toBe(true);
    m.answer(true);
    expect(await notices(1)).toEqual([
      { chat: LEAD, notice: { story: "STORY-1", outcome: "merged", summary: `${FEATURE_BRANCH}.` } },
    ]);
    expect(isMerged(parseCard(w.repo.show(w.repo.main, FEATURE_BRANCH, "STORY-1")))).toBe(true);
    expect(m.hasBranch(STORY_BRANCH)).toBe(false);
  });

  it("merges nothing when the user declines, and tells the Dev Lead", async () => {
    await m.start({ remote: false });
    await m.verified();
    const feature = m.tip(FEATURE_BRANCH);
    await ask();
    m.answer(false);
    expect(await notices(1)).toEqual([
      { chat: LEAD, notice: { story: "STORY-1", outcome: "merge declined", summary: "" } },
    ]);
    expect(m.tip(FEATURE_BRANCH)).toBe(feature);
    expect(m.treeExists()).toBe(true);
  });

  it("tells the Dev Lead why a merge it was allowed didn't happen", async () => {
    await m.start({ remote: false });
    await m.verified();
    await ask();
    m.checked = null;
    m.answer(true);
    expect(await notices(1)).toEqual([
      { chat: LEAD, notice: { story: "STORY-1", outcome: "not merged", summary: MERGE_MESSAGES.stale("STORY-1") } },
    ]);
  });

  it("refuses a chat that didn't start the story, a story that can't merge, and a second ask while one waits", async () => {
    await m.start({ remote: false });
    await expect(ask()).rejects.toThrow(MERGE_MESSAGES.notReady("STORY-1", "In Progress"));
    await m.verified();
    await expect(ask("lead-2")).rejects.toThrow(REQUEST_MERGE_MESSAGES.notLead("STORY-1"));
    await ask();
    await expect(ask()).rejects.toThrow(REQUEST_MERGE_MESSAGES.waiting("STORY-1"));
    expect(m.asked).toHaveLength(1);
  });
});

describe("an ask whose Dev Lead chat ends (review fix)", { timeout: 60_000 }, () => {
  afterEach(closeChats);

  it("ends unanswered, so the next ask isn't refused as waiting, and merges nothing", async () => {
    await m.start({ remote: false });
    await m.verified();
    // The real chat manager shows the approval card, in the chat that started the story.
    const lead = await chat("developer");
    const [row] = m.chats.list(w.repo.main);
    const requests = createMergeRequest({
      scan: w.watches.scan,
      chats: {
        storySession: m.chats.storySession,
        list: () => [{ ...row!, story: { ...row!.story!, parent: lead.id } }],
        askApproval: lead.manager.askApproval,
        notify: lead.manager.notify,
      },
      merge: m.merges.merge,
      log: () => {},
    });
    const askNow = () => requests.request(w.repo.main, { story: "STORY-1" }, lead.id);
    await askNow();
    await until(() => lead.events.some((e) => e.type === "approval"));
    await expect(askNow()).rejects.toThrow(REQUEST_MERGE_MESSAGES.waiting("STORY-1"));
    lead.manager.closeProjects(() => false);
    let asked = false;
    for (let i = 0; i < 200 && !asked; i++) {
      asked = await askNow().then(
        () => true,
        () => new Promise<boolean>((r) => setTimeout(() => r(false), 25)),
      );
    }
    expect(asked).toBe(true);
    expect(m.hasBranch(STORY_BRANCH)).toBe(true);
  });
});

describe("story.requestMerge on the agent bridge", () => {
  const writer = createLogWriter({ fs: { read: async () => null, write: async () => {} }, now: () => new Date() });
  const bridge = (enabled = true) =>
    createAgentBridge({
      entry: null,
      enabled: async () => enabled,
      knowledge: async () => "propose",
      chats: {
        info: (id) =>
          id === "lead" ? { dir: "/p", session: "Dev Lead" } : { dir: "/p", session: "Story", story: true },
        report: () => {},
        retitle: () => {},
      },
      writer,
    });

  it("is refused to a story session: a story's work is reviewed, not merged on its own word", async () => {
    await expect(bridge().call("story", "story.requestMerge", { story: "STORY-1" })).rejects.toThrow(
      AGENT_MESSAGES.sessionMerge,
    );
  });

  it("is refused when the project's MCP is off, and says so when the server can't merge", async () => {
    await expect(bridge(false).call("lead", "story.requestMerge", { story: "STORY-1" })).rejects.toThrow(
      AGENT_MESSAGES.mcpOff,
    );
    await expect(bridge().call("lead", "story.requestMerge", { story: "STORY-1" })).rejects.toThrow(
      AGENT_MESSAGES.noMerge,
    );
  });
});
