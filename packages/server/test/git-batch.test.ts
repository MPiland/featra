import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openBatch, treeEntries } from "../src/git-batch.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { card, cardPath, cardRepo, type CardRepo } from "./card-repo.ts";

/** One `git cat-file --batch` for a scan's trees and blobs (BUG-6), on a real repository. */
let repo: CardRepo;

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("STORY-1", "story", null, "Ready"));
  await repo.write(repo.main, card("STORY-2", "story", null, "Ready"));
  await mkdir(join(repo.main, ".featra", "cards", "old"), { recursive: true });
  await writeFile(join(repo.main, ".featra", "cards", "old", "x.md"), "nested\n");
  await writeFile(join(repo.main, ".featra", "cards", "notes.txt"), "not a card\n");
  repo.commit(repo.main, "plan");
});

afterAll(() => repo.dispose());

describe("openBatch", () => {
  it("answers rounds in order through one process, with null for a name git doesn't have", async () => {
    const batch = openBatch("git", repo.main);
    try {
      const [tree, none] = await batch.get(["HEAD:.featra/cards", "HEAD:nothing-here"]);
      expect(none).toBeNull();
      const entries = treeEntries(tree ?? null);
      expect(entries.map((e) => [e.name, e.kind])).toEqual([
        [`STORY-1-card.md`, "blob"],
        [`STORY-2-card.md`, "blob"],
        ["notes.txt", "blob"],
        ["old", "tree"],
      ]);
      const sha = entries[0]?.sha ?? "";
      expect(sha).toBe(repo.git(repo.main, "rev-parse", `HEAD:${cardPath("STORY-1")}`));
      const [blob] = await batch.get([sha]);
      expect(blob?.data.toString("utf8")).toBe(repo.show(repo.main, "HEAD", "STORY-1"));
    } finally {
      await batch.close();
    }
  });

  it("refuses a round after the process ended", async () => {
    const batch = openBatch("git", repo.main);
    await batch.close();
    await expect(batch.get(["HEAD"])).rejects.toThrow("git cat-file");
  });
});

describe("committedCards", () => {
  it("reads each rev's card files, asking git only for blobs the cache doesn't have", async () => {
    const git = createRepoGit();
    const asked: string[][] = [];
    const cached = new Map<string, string>();
    const cache = async (shas: readonly string[], load: (missing: string[]) => Promise<Map<string, string>>) => {
      const missing = shas.filter((s) => !cached.has(s));
      asked.push(missing);
      for (const [sha, text] of await load(missing)) cached.set(sha, text);
      return new Map(shas.map((s) => [s, cached.get(s) ?? ""]));
    };
    const head = repo.git(repo.main, "rev-parse", "HEAD");
    const first = await git.committedCards(repo.main, [head, "refs/heads/main", "refs/heads/none"], cache);
    expect(first.get(head)?.map((f) => f.path)).toEqual([cardPath("STORY-1"), cardPath("STORY-2")]);
    expect(first.get(head)?.[0]?.text).toBe(repo.show(repo.main, "HEAD", "STORY-1"));
    expect(first.get("refs/heads/main")).toEqual(first.get(head));
    expect(first.get("refs/heads/none")).toEqual([]);
    expect(asked[0]).toHaveLength(2);

    await git.committedCards(repo.main, [head], cache);
    expect(asked[1]).toEqual([]);
  });
});
