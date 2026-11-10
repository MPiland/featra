/**
 * STORY-49 AC4: a card pane edit of a draft is saved to the owner copy with a `by: user` history entry, and the
 * draft's user-edit guard (STORY-8 ruling 5) still refuses a revision after it. Real repository, scanner, card actions
 * and draft writer; only the clock is fixed.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCard, type Card, type DraftInput } from "@featra/work-format";
import { createCardActions } from "../src/card-actions.ts";
import { createCardLane } from "../src/card-lane.ts";
import { createDraftWriter, type DraftWriter } from "../src/draft-writer.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";

let scanner: ReturnType<typeof createScanner>;
let actions: ReturnType<typeof createCardActions>;
let writer: DraftWriter;
let repo: CardRepo;
let clock = new Date("2026-11-10T09:00:00Z");

beforeEach(async () => {
  clock = new Date("2026-11-10T09:00:00Z");
  scanner = createScanner(createRepoGit());
  const lane = createCardLane();
  actions = createCardActions({ scan: scanner.scan, now: () => clock, lane });
  writer = createDraftWriter({ scan: scanner.scan, now: () => clock, lane });
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "done"));
  repo.commit(repo.main, "plan");
});
afterEach(async () => {
  await scanner.close();
  await repo.dispose();
});

const draft = (title = "Story one"): DraftInput => ({
  feature: { title: "Shaping", description: "Talk a feature through." },
  stories: [{ id: null, title, story: "As a builder, I draft.", criteria: ["It drafts"], tasks: ["Build it"] }],
});
const dir = () => join(repo.main, ".featra", "cards");
const read = async (id: string): Promise<Card> => {
  const name = (await readdir(dir())).find((f) => f.startsWith(`${id}-`)) ?? "";
  return parseCard(await readFile(join(dir(), name), "utf8"));
};
/** The draft's feature and story, as the first call made them. */
const start = async () => {
  const made = await writer.draft(repo.main, "chat-1", draft());
  clock = new Date("2026-11-10T09:30:00Z");
  return { feature: made.feature, story: made.stories[0] as string };
};

describe("a pane edit of a draft card", () => {
  it("saves to the owner copy (main's file) and appends a by:user content entry on the server's clock", async () => {
    const { story } = await start();
    const r = await actions.update(repo.main, story, { field: "title", from: "Story one", to: "My title" });
    expect(r).toMatchObject({ ok: true, view: { title: "My title", owner: "main" } });
    expect((await read(story)).history.at(-1)).toEqual({
      at: "2026-11-10T09:30:00Z",
      field: "content",
      from: JSON.stringify({ title: "Story one" }),
      to: "title",
      by: "user",
    });
  });

  it("appends one entry per edit, for each kind of text", async () => {
    const { feature, story } = await start();
    await actions.update(repo.main, feature, { field: "description", from: "Talk a feature through.", to: "Mine." });
    await actions.update(repo.main, story, { field: "ac", index: 0, from: "It drafts", to: "It reviews" });
    await actions.update(repo.main, story, { field: "task", index: 0, from: "Build it", to: "Review it" });
    const parts = (await read(story)).history.filter((e) => e.by === "user").map((e) => e.to);
    expect(parts).toEqual(["criteria", "tasks"]);
    expect((await read(feature)).history.at(-1)).toMatchObject({ to: "description", by: "user" });
  });

  it("refuses a later draft_cards revision that would change what the user edited, and writes nothing", async () => {
    const { story } = await start();
    await actions.update(repo.main, story, { field: "title", from: "Story one", to: "My title" });
    const before = await readFile(join(dir(), (await readdir(dir())).find((f) => f.startsWith(story)) ?? ""), "utf8");
    await expect(
      writer.draft(repo.main, "chat-1", {
        ...draft("Agent's title"),
        stories: [{ ...draft().stories[0]!, id: story, title: "Agent's title" }],
      }),
    ).rejects.toThrow(/The user edited these cards[\s\S]*My title/);
    const after = await readFile(join(dir(), (await readdir(dir())).find((f) => f.startsWith(story)) ?? ""), "utf8");
    expect(after).toBe(before);
  });

  it("still refuses when the user typed the draft's own text back, since the history shows the edit", async () => {
    const { story } = await start();
    await actions.update(repo.main, story, { field: "title", from: "Story one", to: "Typed" });
    await actions.update(repo.main, story, { field: "title", from: "Typed", to: "Story one" });
    await expect(
      writer.draft(repo.main, "chat-1", {
        ...draft(),
        stories: [{ ...draft().stories[0]!, id: story, title: "Agent's title" }],
      }),
    ).rejects.toThrow(/The user edited these cards/);
  });
});

describe("card.update can't approve or reject a draft (STORY-51 has its own path)", () => {
  it("refuses a move out of draft, and writes nothing", async () => {
    const { feature } = await start();
    const file = join(dir(), (await readdir(dir())).find((f) => f.startsWith(feature)) ?? "");
    const before = await readFile(file, "utf8");
    for (const to of ["approved", "active", "cancelled"]) {
      const r = await actions.update(repo.main, feature, { field: "status", from: "draft", to });
      expect(r).toMatchObject({ ok: false, error: expect.stringContaining("Approve") });
    }
    expect(await readFile(file, "utf8")).toBe(before);
    expect((await read(feature)).status).toBe("draft");
  });
});

describe("a revision and the user's notes", () => {
  it("leaves the notes the user wrote on the story exactly as they were", async () => {
    const { story } = await start();
    await actions.update(repo.main, story, { field: "notes", from: "", to: "My own notes." });
    const r = await writer.draft(repo.main, "chat-1", {
      ...draft("Agent's title"),
      stories: [{ ...draft().stories[0]!, id: story, title: "Agent's title" }],
    });
    expect(r.created).toBe(false);
    const after = await read(story);
    expect(after.title).toBe("Agent's title");
    expect(after.notes).toBe("My own notes.");
  });
});
