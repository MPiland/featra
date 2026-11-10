import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCard, type Card, type DraftInput } from "@featra/work-format";
import { createDraftWriter, DRAFT_MESSAGES, type DraftWriter } from "../src/draft-writer.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";

/**
 * STORY-8: what `draft_cards` writes, on a real repository: the real scanner, git and disk, the real planner. Only the
 * clock is fixed.
 */
let now = new Date("2026-11-10T09:00:00Z");
let scanner: ReturnType<typeof createScanner>;
let writer: DraftWriter;
let repo: CardRepo;

beforeEach(async () => {
  now = new Date("2026-11-10T09:00:00Z");
  scanner = createScanner(createRepoGit());
  writer = createDraftWriter({ scan: scanner.scan, now: () => now });
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "done"));
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Done"));
  repo.commit(repo.main, "plan");
});

afterEach(async () => {
  await scanner.close();
  await repo.dispose();
});

const draft = (stories = 2, title = "Shaping"): DraftInput => ({
  feature: { title, description: "Talk a feature through with the Dev Lead." },
  stories: Array.from({ length: stories }, (_, i) => ({
    id: null,
    title: `Story ${i + 1}`,
    story: `As a builder, I do thing ${i + 1}.`,
    criteria: [`Thing ${i + 1} happens`],
    tasks: ["Build it"],
  })),
});

const cardsDir = () => join(repo.main, ".featra", "cards");
const files = async () => (await readdir(cardsDir())).toSorted();
const text = (name: string) => readFile(join(cardsDir(), name), "utf8");
const snapshot = async () => Promise.all((await files()).map(text));
const read = async (id: string): Promise<Card> => {
  const name = (await files()).find((f) => f.startsWith(`${id}-`)) ?? "";
  return parseCard(await text(name));
};

describe("AC1: the first call writes a Draft feature with its stories to main, uncommitted", () => {
  it("writes the feature and each story as card files in main's checkout and commits nothing", async () => {
    const head = repo.git(repo.main, "rev-parse", "HEAD");
    const result = await writer.draft(repo.main, "chat-1", draft());
    expect(result).toEqual({
      feature: "FEAT-2",
      stories: ["STORY-2", "STORY-3"],
      created: true,
      changed: ["FEAT-2", "STORY-2", "STORY-3"],
      cancelled: [],
    });
    expect((await files()).filter((f) => !/^(FEAT-1|STORY-1)-/.test(f))).toEqual([
      "FEAT-2-shaping.md",
      "STORY-2-story-1.md",
      "STORY-3-story-2.md",
    ]);
    expect(repo.git(repo.main, "rev-parse", "HEAD")).toBe(head);
    expect(repo.git(repo.main, "status", "--porcelain", "--untracked-files=all").split("\n").toSorted()).toEqual([
      "?? .featra/cards/FEAT-2-shaping.md",
      "?? .featra/cards/STORY-2-story-1.md",
      "?? .featra/cards/STORY-3-story-2.md",
    ]);
  });

  it("writes cards the app reads back: a Draft feature with user story, criteria and tasks, owned by main", async () => {
    await writer.draft(repo.main, "chat-1", draft(1));
    const scan = await scanner.scan(repo.main);
    const owned = scan?.resolution.cards.find((c) => c.card.id === "STORY-2");
    expect(owned?.owner).toEqual({ kind: "main" });
    expect(owned?.card).toMatchObject({
      parent: "FEAT-2",
      status: "New",
      description: "As a builder, I do thing 1.",
      acs: [{ text: "Thing 1 happens", done: false, test: null }],
      tasks: [{ text: "Build it", done: false }],
    });
    const feature = scan?.resolution.cards.find((c) => c.card.id === "FEAT-2");
    expect(feature).toMatchObject({
      owner: { kind: "main" },
      card: { status: "draft", history: [{ by: "session:chat-1" }] },
    });
    expect(scan?.resolution.stale).toEqual([]);
  });

  it("allocates IDs the project has never used: those on a feature branch and in a story worktree count", async () => {
    repo.git(repo.main, "branch", "feature/7");
    await repo.commitOn("feature/7", (t) => repo.write(t, card("FEAT-7", "feature", null, "active")), "start");
    const tree = repo.worktree("story-30", "story-30", "feature/7");
    await repo.write(tree, card("STORY-30", "story", "FEAT-7", "In Progress"));
    const result = await writer.draft(repo.main, "chat-1", draft(2));
    expect(result.feature).toBe("FEAT-8");
    expect(result.stories).toEqual(["STORY-31", "STORY-32"]);
  });

  it("gives two chats drafting at the same moment different IDs", async () => {
    const [a, b] = await Promise.all([
      writer.draft(repo.main, "chat-a", draft(2, "A")),
      writer.draft(repo.main, "chat-b", draft(2, "B")),
    ]);
    const ids = [a.feature, ...a.stories, b.feature, ...b.stories];
    expect(new Set(ids).size).toBe(6);
    expect((await files()).length).toBe(2 + 6);
  });

  it("works from a chat in another worktree of the project: the draft still goes to main", async () => {
    const tree = repo.worktree("other-work", "other-work");
    await writer.draft(tree, "chat-1", draft(1));
    expect(await files()).toContain("FEAT-2-shaping.md");
    expect(await readdir(join(tree, ".featra", "cards"))).not.toContain("FEAT-2-shaping.md");
  });

  it("refuses when main isn't checked out, since the draft lives there, and writes nothing", async () => {
    repo.git(repo.main, "checkout", "-q", "-b", "elsewhere");
    await expect(writer.draft(repo.main, "chat-1", draft())).rejects.toThrow(DRAFT_MESSAGES.noMain);
    expect(await files()).toEqual(["FEAT-1-card.md", "STORY-1-card.md"]);
  });

  it("refuses a folder that isn't a Featra project in git", async () => {
    const plain = join(repo.root, "plain");
    await mkdir(plain);
    await expect(writer.draft(plain, "chat-1", draft())).rejects.toThrow(DRAFT_MESSAGES.notProject);
  });

  it("leaves none of a draft's new cards behind when one can't be written", async () => {
    // A folder where the first story's file belongs: the write onto it fails after the feature was written.
    await mkdir(join(repo.main, ".featra", "cards", "STORY-2-story-1.md"));
    await expect(writer.draft(repo.main, "chat-1", draft())).rejects.toThrow("Can't save the draft");
    expect(await files()).toEqual(["FEAT-1-card.md", "STORY-1-card.md", "STORY-2-story-1.md"]);
  });
});

describe("AC3: a later call from the same chat updates the draft in place", () => {
  it("keeps the feature, the story IDs and the files, and records the change in each changed card's history", async () => {
    await writer.draft(repo.main, "chat-1", draft());
    const before = await files();
    now = new Date("2026-11-10T10:30:00Z");
    const revised = draft();
    revised.feature.title = "Shaping, revised";
    revised.stories = revised.stories.map((s, i) => ({ ...s, id: `STORY-${i + 2}` }));
    revised.stories[0] = { ...revised.stories[0]!, criteria: ["Thing 1 happens", "Thing 1 is shown"] };
    const result = await writer.draft(repo.main, "chat-1", revised);
    expect(result).toMatchObject({
      feature: "FEAT-2",
      stories: ["STORY-2", "STORY-3"],
      created: false,
      changed: ["FEAT-2", "STORY-2"],
    });
    // Same files: no copy, and the feature's file keeps the name it was made with.
    expect(await files()).toEqual(before);
    const scan = await scanner.scan(repo.main);
    const byId = (id: string) => scan?.resolution.cards.find((c) => c.card.id === id)?.card as Card;
    expect(byId("FEAT-2").title).toBe("Shaping, revised");
    expect(byId("FEAT-2").history.at(-1)).toEqual({
      at: "2026-11-10T10:30:00Z",
      field: "content",
      from: null,
      to: "title",
      by: "session:chat-1",
    });
    expect(byId("STORY-2").acs).toHaveLength(2);
    expect(byId("STORY-2").history.at(-1)).toMatchObject({
      field: "content",
      to: "criteria",
      at: "2026-11-10T10:30:00Z",
    });
    expect(byId("STORY-3").history).toHaveLength(1);
    expect(repo.git(repo.main, "status", "--porcelain", "--untracked-files=all").split("\n")).toHaveLength(3);
  });

  it("cancels a story the revision leaves out and adds new ones under the same feature", async () => {
    await writer.draft(repo.main, "chat-1", draft());
    const revised = draft(2);
    revised.stories = [
      { ...revised.stories[0]!, id: "STORY-2" },
      { ...revised.stories[1]!, id: null, title: "Brand new" },
    ];
    const result = await writer.draft(repo.main, "chat-1", revised);
    expect(result).toMatchObject({ stories: ["STORY-2", "STORY-4"], cancelled: ["STORY-3"], created: false });
    const scan = await scanner.scan(repo.main);
    const status = (id: string) => scan?.resolution.cards.find((c) => c.card.id === id)?.card.status;
    expect([status("STORY-2"), status("STORY-3"), status("STORY-4")]).toEqual(["New", "Cancelled", "New"]);
  });

  it("starts a new draft for another chat, leaving the first chat's draft alone", async () => {
    await writer.draft(repo.main, "chat-1", draft());
    const other = await writer.draft(repo.main, "chat-2", draft(1, "Other"));
    expect(other).toMatchObject({ created: true, feature: "FEAT-3" });
    expect((await read("FEAT-2")).title).toBe("Shaping");
  });

  it("refuses a story id the draft doesn't have, and changes nothing", async () => {
    await writer.draft(repo.main, "chat-1", draft());
    const before = await snapshot();
    const bad = draft();
    bad.stories[0] = { ...bad.stories[0]!, id: "STORY-1" };
    await expect(writer.draft(repo.main, "chat-1", bad)).rejects.toThrow("STORY-1 isn't a story of FEAT-2");
    expect(await snapshot()).toEqual(before);
  });
});

describe("AC2: the draft shows in Work with a Review badge", () => {
  it("is in the Work list as a draft feature marked for review, with the chat that drafted it", async () => {
    await writer.draft(repo.main, "chat-9", draft());
    const list = await scanner.list(repo.main);
    const row = list.epics.flatMap((e) => e.features).find((f) => f.id === "FEAT-2");
    expect(row).toMatchObject({ status: "draft", review: true, draftedBy: "chat-9", title: "Shaping" });
    expect(row?.filters).toContain("needs-review");
    expect(row?.stories.map((s) => [s.id, s.stage])).toEqual([
      ["STORY-2", "New"],
      ["STORY-3", "New"],
    ]);
    const old = list.epics.flatMap((e) => e.features).find((f) => f.id === "FEAT-1");
    expect(old?.review).toBeUndefined();
  });
});
