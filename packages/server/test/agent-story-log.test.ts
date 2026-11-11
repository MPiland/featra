/**
 * STORY-10 review: a story session works in its worktree, so what it logs (decisions.md, open-questions.md) is written
 * there and committed with its work, never into the user's own checkout. Real services, real git (story-fixture.ts).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { storyWorld, type Client, type StoryWorld } from "./story-fixture.ts";

let w: StoryWorld;
let session: Client;
let lead: Client;
const five = () => join(w.repo.main, ".claude", "worktrees", "STORY-5-spawn-five");

async function ask(agent: Client, method: string, params: Record<string, unknown>) {
  const id = Math.floor(Math.random() * 1e9);
  agent.socket.send({ id, method, params });
  return agent.socket.next((f) => f.id === id, 20_000);
}

beforeAll(async () => {
  w = await storyWorld({ drafted: true });
  lead = await w.agentOf(w.drafter);
  const own = await w.spawnAs({ agent: lead }, "STORY-5");
  session = await w.agentOf(own.chat);
}, 60_000);
afterAll(() => w.close());

describe("what a story session logs", () => {
  it("lands in its worktree, and the user's checkout is left alone", async () => {
    const decision = await ask(session, "log.append", {
      kind: "decision",
      decision: "Use the worktree",
      why: "It is mine.",
    });
    expect(decision).toMatchObject({ ok: true });
    const question = await ask(session, "log.append", {
      kind: "question",
      question: "Which folder?",
      context: "Unsure.",
    });
    expect(question).toMatchObject({ ok: true });
    expect(await readFile(join(five(), "decisions.md"), "utf8")).toContain("Use the worktree");
    expect(await readFile(join(five(), "open-questions.md"), "utf8")).toContain("Which folder?");
    expect(w.repo.git(w.repo.main, "status", "--porcelain")).toBe("");
  });

  it("still lands in the project for the Dev Lead, which works there", async () => {
    expect(
      await ask(lead, "log.append", { kind: "decision", decision: "Lead decides", why: "It leads." }),
    ).toMatchObject({ ok: true });
    expect(await readFile(join(w.repo.main, "decisions.md"), "utf8")).toContain("Lead decides");
  });
});
