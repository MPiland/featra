/**
 * STORY-9 AC1, AC2, AC4 and AC6: starting a story makes its worktree off the feature branch where the provider keeps
 * worktrees, moves the card to it, and starts a session there, nested under the Dev Lead's chat. Real services, sockets
 * and git; only the Agent SDK and the clock are faked.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUILT_IN_ROLES, itemIdOfBranch, parseCard, type ChatSummary } from "@featra/work-format";
import { storyWorld, type StoryWorld } from "./story-fixture.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld();
});
afterAll(() => w.close());

const folder = (name: string) => join(w.repo.main, ".claude", "worktrees", name);
const rowOf = (node: unknown, id: string): Record<string, unknown> | null => {
  if (Array.isArray(node)) return node.map((n) => rowOf(n, id)).find((n) => n !== null) ?? null;
  if (typeof node !== "object" || node === null) return null;
  const rec = node as Record<string, unknown>;
  if (rec.id === id && "stage" in rec) return rec;
  return (
    Object.values(rec)
      .map((n) => rowOf(n, id))
      .find((n) => n !== null) ?? null
  );
};
const work = async () => (await w.window.ask("work.watch", { dir: w.repo.main })).result;

describe("AC1 and AC4: the Start button", () => {
  it("cuts the worktree off the feature branch, moves the card to it, and lists the session with its story", async () => {
    const lead = await w.devLead();
    const reply = await w.window.ask("story.start", { dir: w.repo.main, id: "STORY-5" });
    expect(reply).toMatchObject({ ok: true, result: { queued: false } });
    const chat = (reply.result as { chat: string }).chat;

    const where = folder("STORY-5-spawn-five");
    expect(existsSync(where)).toBe(true);
    expect(w.repo.git(where, "rev-parse", "--abbrev-ref", "HEAD")).toBe("featra/story-5-spawn-five");
    expect(itemIdOfBranch("featra/story-5-spawn-five")).toBe("STORY-5");
    expect(
      w.repo.git(w.repo.main, "merge-base", "--is-ancestor", "feature/2-delegation", "featra/story-5-spawn-five"),
    ).toBe("");
    // Excluded once, through .git/info/exclude, so the worktree is not seen as a change.
    const exclude = readFileSync(join(w.repo.main, ".git", "info", "exclude"), "utf8");
    expect(exclude.split(/\r?\n/).filter((l) => l === ".claude/worktrees/")).toHaveLength(1);
    expect(w.repo.git(w.repo.main, "status", "--porcelain", "--", ".claude")).toBe("");

    // The card in the worktree is the owner's copy: In Progress, with its agent, model, session and the starter.
    const started = await w.card("STORY-5", where);
    expect(started).toMatchObject({
      status: "In Progress",
      agent: "claude",
      role: "developer",
      branch: "featra/story-5-spawn-five",
    });
    expect(started.sessions).toEqual([chat]);
    expect(started.history.at(-1)).toMatchObject({ from: "New", to: "In Progress", by: "user" });
    // Left uncommitted, and the feature branch's copy is as it was.
    expect(w.repo.git(where, "status", "--porcelain")).toContain("STORY-5");
    expect(parseCard(w.repo.show(w.repo.main, "feature/2-delegation", "STORY-5")).status).toBe("New");

    // AC4: the Work row follows the owner: In Progress, with the agent, model and session.
    const row = rowOf(await work(), "STORY-5");
    expect(row).toMatchObject({ stage: "In Progress", agent: "claude", session: chat });
    expect(typeof row?.model).toBe("string");

    // AC4: the session is listed with the story it works on, nested under the feature's chat id or a feature group.
    const listed = (await w.sessions()).find((c: ChatSummary) => c.id === chat);
    expect(listed?.story).toMatchObject({ id: "STORY-5", feature: "FEAT-2", featureTitle: "Delegation" });
    expect(listed?.card).toBe("STORY-5");
    expect(lead.id).not.toBe(chat);
  });

  it("starts the agent in the worktree with the role template as its system prompt, and the card, branch, worktree and pointers as the first message", async () => {
    const where = folder("STORY-5-spawn-five");
    const run = w.claude.runs.at(-1)!;
    expect(run.options.cwd).toBe(where);
    await w.until(() => run.heard.length === 1);
    const first = run.heard[0]!;
    // The role's prompt is sent once, as the system prompt; the first message does not repeat it.
    const role = BUILT_IN_ROLES.find((r) => r.id === "developer")!;
    expect(JSON.stringify(run.options.systemPrompt)).toContain(role.prompt.trim().slice(0, 60));
    expect(first).not.toContain(role.prompt.trim().slice(0, 60));
    expect(first).toContain('You are working on STORY-5, "Spawn five"');
    expect(first).toContain("Do Spawn five.");
    expect(first).toContain("Branch: featra/story-5-spawn-five");
    expect(first).toContain(`Worktree: ${where}`);
    expect(first).toContain("CONTEXT.md");
    expect(first).toContain("decisions.md");
    expect(first).not.toContain("Brief from the Dev Lead");
  });

  it("refuses a story that has been started, one that isn't a story, a gone card, and a feature that isn't started", async () => {
    const ask = (id: string) => w.window.ask("story.start", { dir: w.repo.main, id });
    expect(await ask("STORY-5")).toMatchObject({ ok: false, error: "STORY-5 is already In Progress." });
    expect(await ask("STORY-8")).toMatchObject({ ok: false, error: "STORY-8 is already Done." });
    expect(await ask("FEAT-2")).toMatchObject({ ok: false, error: "FEAT-2 isn't a story." });
    expect(await ask("STORY-99")).toMatchObject({ ok: false, error: "That card is gone." });
    expect(await w.window.ask("story.start", { dir: w.repo.main })).toMatchObject({
      ok: false,
      error: "Expected { dir, id }.",
    });
  });
});

describe("AC2: the Dev Lead's brief", () => {
  it("is part of the first message when spawn_session gives one, and the card says who started it", async () => {
    const lead = await w.devLead();
    const before = w.claude.runs.length;
    lead.agent.socket.send({
      id: 1,
      method: "story.spawn",
      params: { story: "STORY-6", brief: "Mind the Windows paths." },
    });
    const answered = await lead.agent.socket.next((f) => f.id === 1, 20_000);
    expect(answered).toMatchObject({ ok: true, result: { queued: false } });
    await w.until(() => (w.claude.runs[before]?.heard.length ?? 0) === 1);
    const run = w.claude.runs[before]!;
    expect(run.heard[0]).toContain("Brief from the Dev Lead:\nMind the Windows paths.");
    const started = await w.card("STORY-6", folder("STORY-6-spawn-six"));
    expect(started.history.at(-1)).toMatchObject({ from: "Ready", to: "In Progress", by: `session:${lead.id}` });
    // The session is the child of the chat that called.
    const listed = (await w.sessions()).find((c) => c.story?.id === "STORY-6");
    expect(listed?.story?.parent).toBe(lead.id);
  });
});

describe("AC6: a role that can't run the story", () => {
  it("is refused in one sentence, and no worktree is made", async () => {
    const lead = await w.devLead();
    lead.agent.socket.send({ id: 1, method: "story.spawn", params: { story: "STORY-7", role: "nonesuch" } });
    expect(await lead.agent.socket.next((f) => f.id === 1, 20_000)).toMatchObject({
      ok: false,
      error: "No such role.",
    });
    expect(existsSync(folder("STORY-7-spawn-seven"))).toBe(false);
  });
});

describe("AC4: a feature a chat drafted", () => {
  it("nests the session under the chat that drafted the feature", async () => {
    const drafted = await storyWorld({ drafted: true });
    try {
      expect(drafted.drafter).not.toBe("");
      const reply = await drafted.window.ask("story.start", { dir: drafted.dir, id: "STORY-5" });
      const chat = (reply.result as { chat: string }).chat;
      const listed = (await drafted.sessions()).find((c: ChatSummary) => c.id === chat);
      expect(listed?.story?.parent).toBe(drafted.drafter);
    } finally {
      await drafted.close();
    }
  });
});
