import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DraftInput } from "@featra/work-format";
import { createCardActions } from "../src/card-actions.ts";
import { createCardLane } from "../src/card-lane.ts";
import { createDraftWriter } from "../src/draft-writer.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner, type Scan } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";

/**
 * STORY-8 review rulings 1, 5 and 7 on a real repository: a revision is all or nothing, the user's edits through the
 * card pane are not overwritten, and no card is ever overwritten by a draft that allocated a taken ID. Real scanner,
 * git, disk and planner; only the clock is fixed, and a failing disk write or a stale scan is injected where noted.
 */
const NOW = new Date("2026-11-10T09:00:00Z");
let scanner: ReturnType<typeof createScanner>;
let repo: CardRepo;

beforeEach(async () => {
  scanner = createScanner(createRepoGit());
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
const revision = (title: string): DraftInput => {
  const first = draft();
  return {
    feature: { ...first.feature, title },
    stories: first.stories.map((s, i) => Object.assign({}, s, { id: `STORY-${i + 2}`, title: `${s.title}, revised` })),
  };
};

const cardsDir = () => join(repo.main, ".featra", "cards");
const files = async () => (await readdir(cardsDir())).toSorted();
const snapshot = async () =>
  Promise.all((await files()).map(async (f) => [f, await readFile(join(cardsDir(), f), "utf8")]));

describe("ruling 1: a revision changes every card or none", () => {
  it("restores the cards it had written, and removes the new ones, when a later write fails", async () => {
    const writer = createDraftWriter({ scan: scanner.scan, now: () => NOW });
    await writer.draft(repo.main, "chat-1", draft());
    const before = await snapshot();
    let writes = 0;
    const failing = createDraftWriter({
      scan: scanner.scan,
      now: () => NOW,
      io: {
        write: async (file, text) => {
          if (++writes === 3) throw new Error("disk full");
          await writeFile(file, text, "utf8");
        },
      },
    });
    const more = revision("Shaping, revised");
    more.stories.unshift({ ...draft(1).stories[0]!, title: "A new first story" });
    await expect(failing.draft(repo.main, "chat-1", more)).rejects.toThrow("Can't save the draft: disk full");
    expect(writes).toBe(3);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses before writing anything when a card it would change is owned by a branch that isn't checked out", async () => {
    const writer = createDraftWriter({ scan: scanner.scan, now: () => NOW });
    await writer.draft(repo.main, "chat-1", draft());
    const before = await snapshot();
    const moved = async (dir: string): Promise<Scan | null> => {
      const scan = await scanner.scan(dir);
      if (!scan) return scan;
      const cards = scan.resolution.cards.map((c) =>
        c.card.id === "STORY-3" ? Object.assign({}, c, { owner: { kind: "feature", branch: "feature/gone" } }) : c,
      );
      return { ...scan, resolution: { ...scan.resolution, cards } };
    };
    const blind = createDraftWriter({ scan: moved, now: () => NOW });
    await expect(blind.draft(repo.main, "chat-1", revision("Shaping, revised"))).rejects.toThrow(
      "STORY-3 is owned by a branch that isn't checked out.",
    );
    expect(await snapshot()).toEqual(before);
  });
});

describe("ruling 5: the user's edits in the card pane are not overwritten", () => {
  it("refuses a revision after the user retitled a story, lists the card, and writes nothing", async () => {
    const writer = createDraftWriter({ scan: scanner.scan, now: () => NOW });
    await writer.draft(repo.main, "chat-1", draft());
    const edited = await createCardActions({ scan: scanner.scan, now: () => NOW }).update(repo.main, "STORY-2", {
      field: "title",
      from: "Story 1",
      to: "The user's title",
    });
    expect(edited.ok).toBe(true);
    const before = await snapshot();
    await expect(writer.draft(repo.main, "chat-1", revision("Shaping, revised"))).rejects.toThrow(
      /STORY-2 "The user's title"[\s\S]*Criteria: Thing 1 happens[\s\S]*Tasks: Build it/,
    );
    expect(await snapshot()).toEqual(before);
  });

  it("goes through once the agent sends the user's text, and the feature stays a draft", async () => {
    const writer = createDraftWriter({ scan: scanner.scan, now: () => NOW });
    await writer.draft(repo.main, "chat-1", draft());
    await createCardActions({ scan: scanner.scan, now: () => NOW }).update(repo.main, "STORY-2", {
      field: "title",
      from: "Story 1",
      to: "The user's title",
    });
    const merged = revision("Shaping, revised");
    merged.stories[0] = { ...merged.stories[0]!, title: "The user's title" };
    await expect(writer.draft(repo.main, "chat-1", merged)).resolves.toMatchObject({ created: false });
  });
});

describe("ruling 7: an existing card file is never overwritten, and the allocator is one", () => {
  it("allocates again when a stale scan hands out an ID whose file exists", async () => {
    const lane = createCardLane();
    const stale = await scanner.scan(repo.main);
    const fresh = createDraftWriter({ scan: scanner.scan, now: () => NOW, lane });
    await fresh.draft(repo.main, "chat-a", draft());
    const before = await snapshot();
    const blind = createDraftWriter({ scan: async () => stale, now: () => NOW, lane });
    const result = await blind.draft(repo.main, "chat-b", draft());
    expect(result).toMatchObject({ feature: "FEAT-3", stories: ["STORY-4", "STORY-5"], created: true });
    const after = await snapshot();
    expect(after.filter(([name]) => before.some(([b]) => b === name))).toEqual(before);
    expect(after).toHaveLength(before.length + 3);
  });

  it("runs a draft and a card edit in one lane, in the order they came", async () => {
    const lane = createCardLane();
    const order: string[] = [];
    const slow = lane.exclusive(async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push("first");
    });
    const failed = lane.exclusive(async () => Promise.reject(new Error("x"))).catch(() => order.push("failed"));
    const last = lane.exclusive(async () => order.push("last"));
    await Promise.all([slow, failed, last]);
    expect(order).toEqual(["first", "failed", "last"]);
  });
});
