/**
 * STORY-10: agents update their own card, on the real services. A real git repository with a started feature, the real
 * agent socket, card writes, worktrees and Work watches; only the Agent SDK and the clock are faked (story-fixture.ts).
 * A story session's socket is the one its MCP process opens; the Dev Lead is the chat that drafted the feature.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evidenceState, type Card } from "@featra/work-format";
import { storyWorld, type Client, type StoryWorld } from "./story-fixture.ts";

const FOLDER = ".featra/evidence/FEAT-2/STORY-5/";
let w: StoryWorld;
let lead: Client;
let own: { chat: string };
let session: Client;
let other: Client;
let sixChat: string;
const tree = (name: string) => join(w.repo.main, ".claude", "worktrees", name);
const five = () => tree("STORY-5-spawn-five");
const six = () => tree("STORY-6-spawn-six");

/** One `card.update` through a chat's agent socket: its answer frame. */
async function update(agent: Client, params: Record<string, unknown>) {
  const id = Math.floor(Math.random() * 1e9);
  agent.socket.send({ id, method: "card.update", params });
  return agent.socket.next((f) => f.id === id, 20_000);
}
const refusal = (frame: { ok?: boolean; error?: string }) => (frame.ok === true ? null : String(frame.error));

async function evidence(name: string, bytes = 8) {
  const file = join(five(), ...FOLDER.split("/"), name);
  await mkdir(join(five(), ...FOLDER.split("/")), { recursive: true });
  await writeFile(file, Buffer.alloc(bytes, 1));
}

const withWork = (c: Card): Card => ({
  ...c,
  acs: [
    { text: "The first works", done: false, test: null },
    { text: "The second works", done: false, test: null },
  ],
  tasks: [
    { text: "Write it", done: false },
    { text: "Test it", done: false },
  ],
});

const count = (items: { done: boolean }[]) => ({ done: items.filter((i) => i.done).length, total: items.length });

const rowOf = (node: unknown, id: string): Record<string, unknown> | null => {
  if (Array.isArray(node)) return node.map((n) => rowOf(n, id)).find((n) => n !== null) ?? null;
  if (typeof node !== "object" || node === null) return null;
  const rec = node as Record<string, unknown>;
  return rec.id === id && "stage" in rec
    ? rec
    : (Object.values(rec)
        .map((n) => rowOf(n, id))
        .find((n) => n !== null) ?? null);
};

beforeAll(async () => {
  w = await storyWorld({ drafted: true });
  lead = await w.agentOf(w.drafter);
  own = await w.spawnAs({ agent: lead }, "STORY-5");
  sixChat = (await w.spawnAs({ agent: lead }, "STORY-6")).chat;
  session = await w.agentOf(own.chat);
  other = (await w.devLead()).agent;
  // The owner copies are the worktrees': give the stories something to tick.
  await w.repo.write(five(), withWork(await w.card("STORY-5", five())));
  await w.repo.write(six(), withWork(await w.card("STORY-6", six())));
}, 60_000);
afterAll(() => w.close());

describe("AC1: what a story session may write", () => {
  it("moves its stage up to Acceptance, and no further", async () => {
    expect(await update(session, { stage: "In Review" })).toMatchObject({ ok: true, result: { card: "STORY-5" } });
    expect((await w.card("STORY-5", five())).status).toBe("In Review");
    expect(await update(session, { stage: "Acceptance" })).toMatchObject({ ok: true });
    expect((await w.card("STORY-5", five())).status).toBe("Acceptance");
  });

  it.each([
    ["Done", "Only the user moves STORY-5 to Done, once it is verified and accepted; move it to Acceptance."],
    ["Cancelled", "isn't a stage you can move to"],
    ["Ready", "a report only moves a story forward"],
    ["Blocked", "isn't a stage you can move to"],
  ])("refuses %s, and the card stays as it was", async (stage, why) => {
    const before = await readFile(join(five(), ".featra", "cards", "STORY-5-card.md"), "utf8");
    expect(refusal(await update(session, { stage }))).toContain(why);
    expect(await readFile(join(five(), ".featra", "cards", "STORY-5-card.md"), "utf8")).toBe(before);
  });

  it("ticks tasks and criteria, adds tasks, appends a note, and links evidence", async () => {
    await evidence("first.png");
    const answer = await update(session, {
      tasks: ["write it"],
      addTasks: ["Check the paths"],
      criteria: [{ criterion: "The first works", evidence: `${FOLDER}first.png` }],
      note: "Paths are checked.",
    });
    expect(answer).toMatchObject({ ok: true });
    const card = await w.card("STORY-5", five());
    expect(card.tasks).toEqual([
      { text: "Write it", done: true },
      { text: "Test it", done: false },
      { text: "Check the paths", done: false },
    ]);
    expect(card.acs[0]).toEqual({ text: "The first works", done: true, test: null, evidence: `${FOLDER}first.png` });
    expect(card.acs[1]?.done).toBe(false);
    expect(card.notes).toContain("Paths are checked.");
    expect(card.notes).toContain("(Developer chat");
  });

  it("changes nothing else on the card", async () => {
    const card = await w.card("STORY-5", five());
    expect(card).toMatchObject({ title: "Spawn five", description: "Do Spawn five.", parent: "FEAT-2", pr: null });
    expect(card.sessions).toEqual([own.chat]);
  });
});

describe("AC2: the owner copy, history, and the feature list", () => {
  // Its own report, so nothing here leans on what an earlier case did.
  beforeAll(async () => {
    await update(session, { addTasks: ["AC2 task"], note: "AC2 note" });
  });

  it("writes only to the worktree: the feature branch and main keep the card as committed", async () => {
    expect(w.repo.show(w.repo.main, "feature/2-delegation", "STORY-5")).not.toContain("Paths are checked");
    expect(await w.repo.read(w.repo.main, "STORY-5")).not.toContain("Paths are checked");
    expect(w.repo.git(w.repo.main, "status", "--porcelain", "--", ".featra")).toBe("");
  });

  it("appends history events by session:<id>, and the card is Reported, nothing more", async () => {
    const card = await w.card("STORY-5", five());
    const mine = card.history.filter((e) => e.by === `session:${own.chat}`);
    expect(mine.map((e) => e.field)).toContain("status");
    // Review item 3: the event records the delta only, never a before-snapshot.
    expect(mine.at(-1)).toMatchObject({ field: "report", from: null });
    expect(JSON.parse(mine.at(-1)?.to ?? "")).toEqual({ addTasks: ["AC2 task"], note: "AC2 note" });
    expect(evidenceState(card)).toMatchObject({ reported: true, verified: false, proven: false, accepted: false });
  });

  it("does not commit: the worktree's HEAD is where Start left it", () => {
    expect(w.repo.git(five(), "status", "--porcelain")).toContain("STORY-5");
    expect(w.repo.git(five(), "status", "--porcelain")).toContain(".featra/evidence/");
    expect(w.repo.git(five(), "log", "--format=%s", "-1")).not.toContain("STORY-5");
  });

  it("shows on the Work list at once, marked Reported, and pushes it to a watcher", async () => {
    const list = (await w.window.ask("work.watch", { dir: w.repo.main })).result;
    const card = await w.card("STORY-5", five());
    expect(rowOf(list, "STORY-5")).toMatchObject({
      stage: card.status,
      reported: true,
      tasks: count(card.tasks),
      criteria: count(card.acs),
    });
    expect(rowOf(list, "STORY-7")).not.toHaveProperty("reported");
    await update(session, { addTasks: ["Pushed task"] });
    const push = await w.window.socket.next(
      (f) =>
        f.event === "work.list" &&
        (rowOf(f.data, "STORY-5")?.tasks as { total: number })?.total === card.tasks.length + 1,
      15_000,
    );
    expect(rowOf(push.data, "STORY-5")).toMatchObject({ reported: true });
  });
});

const sixText = () => readFile(join(six(), ".featra", "cards", "STORY-6-card.md"), "utf8");

describe("AC3: whose card", () => {
  it("refuses a story session any card but its own, in one sentence, and writes nothing", async () => {
    const before = await sixText();
    const frame = await update(session, { card: "STORY-6", note: "Not mine." });
    expect(refusal(frame)).toBe("A story session can update only its own card, STORY-5.");
    expect(await sixText()).toBe(before);
  });

  it("takes its own card when it names it, in any case", async () => {
    expect(await update(session, { card: "story-5", note: "Named." })).toMatchObject({ ok: true });
  });

  it("lets the Dev Lead of the feature update a story in it, by its own session", async () => {
    expect(await update(lead, { card: "STORY-6", stage: "In Review", tasks: ["Write it"] })).toMatchObject({
      ok: true,
      result: { card: "STORY-6" },
    });
    const card = await w.card("STORY-6", six());
    expect(card.status).toBe("In Review");
    expect(card.history.filter((e) => e.by === `session:${w.drafter}`).map((e) => e.field)).toEqual([
      "status",
      "status",
      "report",
    ]);
    expect(card.history.some((e) => e.by === `session:${sixChat}` && e.field === "report")).toBe(false);
  });

  it("holds the Dev Lead to the same limits: not Done", async () => {
    expect(refusal(await update(lead, { card: "STORY-6", stage: "Done" }))).toContain("Only the user moves STORY-6");
  });

  it("refuses the Dev Lead a card whose owner copy is not checked out here", async () => {
    // Review item 5: an agent is told what it can do, not to check a branch out.
    const frame = await update(lead, { card: "STORY-7", note: "x" });
    expect(refusal(frame)).toBe("STORY-7 has no working copy yet. Start it with spawn_session.");
  });

  it("refuses any other chat, and says which card to name when a Dev Lead leaves it out", async () => {
    const before = await sixText();
    expect(refusal(await update(other, { card: "STORY-6", note: "x" }))).toBe(
      "STORY-6 isn't yours to update: only its own story session and its feature's Dev Lead can.",
    );
    expect(refusal(await update(other, { note: "x" }))).toBe("Say which card to update, as `card`.");
    expect(refusal(await update(lead, { note: "x" }))).toBe("Say which card to update, as `card`.");
    expect(await sixText()).toBe(before);
  });

  it("takes the chat from the connection's secret, so a story session can't be the Dev Lead", async () => {
    const frame = await update(session, { card: "STORY-6", stage: "Acceptance" });
    expect(refusal(frame)).toContain("only its own card");
  });
});

const link = (path: string) => update(session, { criteria: [{ criterion: "The second works", evidence: path }] });

describe("AC4: evidence", () => {
  beforeAll(async () => {
    await evidence("linked.png");
    await update(session, { criteria: [{ criterion: "The first works", evidence: `${FOLDER}linked.png` }] });
  });

  it("links the folder from the card, and the evidence is in the story's own folder", async () => {
    expect(await readFile(join(five(), ".featra", "cards", "STORY-5-card.md"), "utf8")).toContain(
      `evidence: ${FOLDER}`,
    );
  });

  it.each([
    ["a file in another story's folder", ".featra/evidence/FEAT-2/STORY-6/a.png"],
    ["a file elsewhere", "docs/a.png"],
    ["a traversal", `${FOLDER}../STORY-6/a.png`],
    ["a traversal into the card", `${FOLDER}../../../cards/STORY-5-card.md`],
    ["an absolute path", "/etc/passwd"],
    ["a Windows path", ".featra\\evidence\\FEAT-2\\STORY-5\\a.png"],
  ])("refuses %s", async (_name, path) => {
    await evidence("a.png");
    const before = await readFile(join(five(), ".featra", "cards", "STORY-5-card.md"), "utf8");
    expect(refusal(await link(path))).toContain(`Evidence goes in ${FOLDER}`);
    expect(await readFile(join(five(), ".featra", "cards", "STORY-5-card.md"), "utf8")).toBe(before);
  });

  it("refuses a file that isn't there, a folder, and one that is too big", async () => {
    expect(refusal(await link(`${FOLDER}missing.png`))).toBe(
      `${FOLDER}missing.png isn't there: write the file in your worktree first.`,
    );
    await mkdir(join(five(), ...FOLDER.split("/"), "dir.png"), { recursive: true });
    expect(refusal(await link(`${FOLDER}dir.png`))).toBe(`${FOLDER}dir.png isn't a plain file.`);
    await evidence("big.png", 1_000_001);
    expect(refusal(await link(`${FOLDER}big.png`))).toContain("is over 1 MB: keep evidence small");
    await evidence("exact.png", 1_000_000);
    expect(await link(`${FOLDER}exact.png`)).toMatchObject({ ok: true });
    expect((await stat(join(five(), ...FOLDER.split("/"), "exact.png"))).size).toBe(1_000_000);
  });

  it("keeps one link per criterion: the newest", async () => {
    await evidence("old.png");
    await evidence("new.png");
    await update(session, { criteria: [{ criterion: "The first works", evidence: `${FOLDER}old.png` }] });
    await update(session, { criteria: [{ criterion: "The first works", evidence: `${FOLDER}new.png` }] });
    expect((await w.card("STORY-5", five())).acs[0]?.evidence).toBe(`${FOLDER}new.png`);
  });
});
