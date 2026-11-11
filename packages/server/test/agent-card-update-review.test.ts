/**
 * STORY-10 review: the rules around who and what an agent's report may touch, on the real services and a real git
 * repository (story-fixture.ts). Each case builds on nothing an earlier one did.
 */
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Card } from "@featra/work-format";
import { openFrames } from "./ws-frames.ts";
import { storyWorld, type Client, type StoryWorld } from "./story-fixture.ts";

const folder = (story: string) => `.featra/evidence/FEAT-2/${story}/`;
let w: StoryWorld;
let lead: Client;
const tree = (name: string) => join(w.repo.main, ".claude", "worktrees", name);
const trees = { "STORY-5": "STORY-5-spawn-five", "STORY-6": "STORY-6-spawn-six", "STORY-9": "STORY-9-spawn-9" };
const at = (story: keyof typeof trees) => tree(trees[story]);

async function update(agent: Client, params: Record<string, unknown>) {
  const id = Math.floor(Math.random() * 1e9);
  agent.socket.send({ id, method: "card.update", params });
  return agent.socket.next((f) => f.id === id, 20_000);
}
const outside = () => join(w.repo.main, "..", "outside-evidence");
const link = (session: Client, path: string) => update(session, { criteria: [{ criterion: "A", evidence: path }] });
const refusal = (frame: { ok?: boolean; error?: string }) => (frame.ok === true ? null : String(frame.error));

beforeAll(async () => {
  w = await storyWorld({ drafted: true, config: "maxStoryAgents: 10\n", watched: true });
  lead = await w.agentOf(w.drafter);
}, 60_000);
afterAll(() => w.close());

describe("a card that is closed", () => {
  let session: Client;
  beforeAll(async () => {
    session = await w.agentOf((await w.spawnAs({ agent: lead }, "STORY-5")).chat);
  }, 30_000);

  it.each(["Done", "Cancelled"])("takes no report when it is %s, and the file is untouched", async (status) => {
    await w.repo.write(at("STORY-5"), { ...(await w.card("STORY-5", at("STORY-5"))), status });
    const before = await readFile(join(at("STORY-5"), ".featra", "cards", "STORY-5-card.md"), "utf8");
    expect(refusal(await update(session, { note: "x" }))).toContain(status);
    expect(refusal(await update(session, { stage: "Acceptance" }))).toContain(status);
    expect(await readFile(join(at("STORY-5"), ".featra", "cards", "STORY-5-card.md"), "utf8")).toBe(before);
  });
});

describe("whose card: the Dev Lead scope", () => {
  it("includes the chat a story session nests under, and not an unrelated chat", async () => {
    const spawner = await w.devLead();
    const stranger = await w.devLead();
    const own = await w.spawnAs(spawner, "STORY-9");
    expect(own.chat).toBeTruthy();
    expect(await update(spawner.agent, { card: "STORY-9", note: "From the spawning Dev Lead." })).toMatchObject({
      ok: true,
    });
    expect(refusal(await update(stranger.agent, { card: "STORY-9", note: "Mine?" }))).toBe(
      "STORY-9 isn't yours to update: only its own story session and its feature's Dev Lead can.",
    );
    expect((await w.card("STORY-9", at("STORY-9"))).notes).toContain("From the spawning Dev Lead.");
    expect((await w.card("STORY-9", at("STORY-9"))).notes).not.toContain("Mine?");
  });
});

describe("a session that is no longer the story's latest", () => {
  it("is refused once a newer one is on the card", async () => {
    const session = await w.agentOf((await w.sessions()).find((s) => s.story?.id === "STORY-9")?.id ?? "");
    const card = await w.card("STORY-9", at("STORY-9"));
    await w.repo.write(at("STORY-9"), { ...card, sessions: [...card.sessions, "a-newer-session"] });
    expect(refusal(await update(session, { note: "Late." }))).toBe(
      "STORY-9 has a newer session: this one can no longer update it.",
    );
  });
});

describe("who is calling", () => {
  it("is the connection's secret, whatever the params say; a wrong secret gets no socket", async () => {
    const own = await w.spawnAs({ agent: lead }, "STORY-6");
    const session = await w.agentOf(own.chat);
    const frame = await update(session, {
      note: "Spoof.",
      chat: w.drafter,
      story: "STORY-5",
      storyId: "STORY-5",
      lead: w.drafter,
      by: "user",
    });
    expect(frame).toMatchObject({ ok: true, result: { card: "STORY-6" } });
    const card = await w.card("STORY-6", at("STORY-6"));
    expect(card.history.filter((e) => e.field === "report").map((e) => e.by)).toEqual([`session:${own.chat}`]);
    await expect(openFrames(w.agentUrl("wrong-secret"))).rejects.toThrow("Can't connect");
    expect(w.services.agents.resolve("wrong-secret")).toBeNull();
  });
});

describe("an agent's report beside the user's edit of the same card", () => {
  it("both land, whatever order they arrive in", async () => {
    const session = await w.agentOf((await w.sessions()).find((s) => s.story?.id === "STORY-6")?.id ?? "");
    let title = (await w.card("STORY-6", at("STORY-6"))).title;
    for (let i = 0; i < 5; i++) {
      const edit = { field: "title", from: title, to: `${title}.${i}` };
      const [mine, theirs] = await Promise.all([
        update(session, { addTasks: [`Task ${i}`] }),
        w.window.ask("card.update", { dir: w.repo.main, id: "STORY-6", edit }),
      ]);
      expect(mine).toMatchObject({ ok: true });
      expect(theirs).toMatchObject({ ok: true, result: { ok: true } });
      title = `${title}.${i}`;
    }
    const card: Card = await w.card("STORY-6", at("STORY-6"));
    expect(card.title).toBe(title);
    expect(card.tasks.map((t) => t.text)).toEqual([0, 1, 2, 3, 4].map((i) => `Task ${i}`));
  });
});

describe("evidence that leads out of its folder", () => {
  const SESSION = "STORY-6";
  let session: Client;

  beforeAll(async () => {
    session = await w.agentOf((await w.sessions()).find((s) => s.story?.id === SESSION)?.id ?? "");
    await w.repo.write(at("STORY-6"), {
      ...(await w.card(SESSION, at("STORY-6"))),
      acs: [{ text: "A", done: false, test: null }],
    });
    await mkdir(outside(), { recursive: true });
    await writeFile(join(outside(), "a.png"), "x");
    await mkdir(join(at("STORY-6"), ...folder(SESSION).split("/")), { recursive: true });
  });

  it("refuses a folder junction that points outside, and a file link too", async () => {
    const home = join(at("STORY-6"), ...folder(SESSION).split("/"));
    await symlink(outside(), join(home, "out"), "junction");
    expect(refusal(await link(session, `${folder(SESSION)}out/a.png`))).toContain("resolves outside");
    const files = await symlink(join(outside(), "a.png"), join(home, "file.png"), "file").then(
      () => ["file.png"],
      () => [], // Windows without the privilege to link files: the folder case above is the proof there.
    );
    for (const name of files) {
      expect(refusal(await link(session, `${folder(SESSION)}${name}`))).toContain("resolves outside");
    }
    expect((await w.card(SESSION, at("STORY-6"))).acs[0]).toMatchObject({ done: false });
  });

  it("matches the real name exactly: case and a trailing dot are not the file", async () => {
    await writeFile(join(at("STORY-6"), ...folder(SESSION).split("/"), "exact.png"), "x");
    expect(await link(session, `${folder(SESSION)}exact.png`)).toMatchObject({ ok: true });
    for (const name of ["EXACT.png", "exact.png."]) {
      expect(refusal(await link(session, `${folder(SESSION)}${name}`))).toContain("isn't there");
    }
  });
});

describe("a session whose worktree is gone", () => {
  it("is refused, and nothing is written anywhere", async () => {
    const own = await w.spawnAs({ agent: lead }, "STORY-10");
    const session = await w.agentOf(own.chat);
    expect(await update(session, { note: "Still here." })).toMatchObject({ ok: true });
    w.repo.git(
      w.repo.main,
      "worktree",
      "remove",
      "--force",
      join(w.repo.main, ".claude", "worktrees", "STORY-10-spawn-10"),
    );
    expect(refusal(await update(session, { note: "Too late." }))).toBe(
      "STORY-10's worktree is gone, so this session can no longer update it.",
    );
    expect(w.repo.git(w.repo.main, "status", "--porcelain", "--", ".featra/cards")).toBe("");
  }, 30_000);
});
