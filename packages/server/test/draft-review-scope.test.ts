/**
 * STORY-51: what the draft is. Every story under the feature that is untracked and owned by main's checkout, including
 * one the user added during review; both actions use exactly that set, and refuse, naming the story, if a child is
 * tracked live or owned elsewhere. Real git, worktrees, scanner and review.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, LEGACY_BASELINE, parseCard, scopeSummary, serializeCard } from "@featra/work-format";
import { card } from "./card-repo.ts";
import { input, draftFixture } from "./draft-review-fixture.ts";

const f = draftFixture();

/** The repo path of card `id`'s file, whatever it is called. */
const cardFile = async (id: string) => `.featra/cards/${(await f.files()).find((n) => n.startsWith(`${id}-`))}`;

describe("a story the user added during review", () => {
  it("is approved with the draft: committed, New, and planned scope", async () => {
    const feature = await f.draft();
    const added = await f.addStory(feature);
    await f.review.approve(f.repo.main, feature);
    expect(f.inCommit()).toContain(await cardFile(added));
    expect((await f.read(added)).status).toBe("New");
    // Approval sets no baseline (ADR 0038): nothing under the approved feature is added scope.
    const approved = await f.read(feature);
    expect(approved.extra[LEGACY_BASELINE]).toBeUndefined();
    expect(scopeSummary(feature, [approved, await f.read(added)], DEFAULT_CONFIG).added).toEqual([]);
    expect(f.status()).toEqual([]);
  });

  it("is deleted by Reject with the rest of the draft", async () => {
    const feature = await f.draft();
    const added = await f.addStory(feature);
    const result = await f.review.reject(f.repo.main, feature);
    expect(result.removed).toBe(4);
    expect(existsSync(join(f.repo.main, await cardFile(added)))).toBe(false);
    expect(await f.files()).toEqual([]);
  });

  it("can have a space in its file name", async () => {
    const feature = await f.draft();
    writeFileSync(
      join(f.cardsDir(), "STORY-90-has a space.md"),
      serializeCard(card("STORY-90", "story", feature, "New")),
    );
    await f.addStory(feature, "STORY-91");
    await f.review.approve(f.repo.main, feature);
    expect(f.status()).toEqual([]);
    expect(f.inCommit()).toContain(".featra/cards/STORY-90-has a space.md");
    expect(f.inCommit()).toContain(await cardFile("STORY-91"));
  });
});

describe("a story that isn't part of the draft", () => {
  it("is left alone by Approve and by Reject", async () => {
    const feature = await f.draft();
    await f.repo.write(f.repo.main, card("STORY-91", "story", "FEAT-1", "New"));
    const cardFile91 = await cardFile("STORY-91");
    await f.review.approve(f.repo.main, feature);
    expect(f.inCommit()).not.toContain(cardFile91);
    expect(f.status()).toEqual([`?? ${cardFile91}`]);
    const other = (await f.writer.draft(f.repo.main, "chat-2", input)).feature;
    const result = await f.review.reject(f.repo.main, other);
    expect(result.removed).toBe(3);
    expect(existsSync(join(f.repo.main, cardFile91))).toBe(true);
  });
});

/** STORY-91 under `feature`, in its own worktree. */
async function inWorktree(feature: string) {
  const tree = f.repo.worktree("story-91", "story-91");
  await f.repo.write(tree, card("STORY-91", "story", feature, "In Progress"));
  return tree;
}

describe("a story owned somewhere else", () => {
  it("refuses Approve, naming the story, changing nothing", async () => {
    const feature = await f.draft();
    await inWorktree(feature);
    const at = f.head();
    await expect(f.review.approve(f.repo.main, feature)).rejects.toThrow(
      `STORY-91 is in worktree story-91; move it out of ${feature} first.`,
    );
    expect(f.head()).toBe(at);
    expect((await f.read(feature)).status).toBe("draft");
  });

  it("refuses Reject, naming the story, deleting nothing", async () => {
    const feature = await f.draft();
    await inWorktree(feature);
    const before = await f.files();
    await expect(f.review.reject(f.repo.main, feature)).rejects.toThrow(
      `STORY-91 is in worktree story-91; move it out of ${feature} first.`,
    );
    expect(await f.files()).toEqual(before);
  });
});

describe("a story git already tracks", () => {
  it("refuses Approve when it is live, naming it, changing nothing", async () => {
    const feature = await f.draft();
    const added = await f.addStory(feature);
    const path = await cardFile(added);
    f.repo.git(f.repo.main, "add", path);
    f.repo.git(f.repo.main, "commit", "-qm", "story", "--", path);
    const at = f.head();
    await expect(f.review.approve(f.repo.main, feature)).rejects.toThrow(
      `${added} is already in git; move it out of ${feature} first.`,
    );
    expect(f.head()).toBe(at);
    expect((await f.read(feature)).status).toBe("draft");
  });

  it("goes into the commit as Cancelled when it was cancelled in the draft, not deleted", async () => {
    const made = await f.writer.draft(f.repo.main, "chat-1", input);
    const [one, two] = made.stories as [string, string];
    const path = await cardFile(two);
    f.repo.git(f.repo.main, "add", path);
    f.repo.git(f.repo.main, "commit", "-qm", "story two", "--", path);
    await f.writer.draft(f.repo.main, "chat-1", { ...input, stories: [{ ...input.stories[0]!, id: one }] });
    expect((await f.read(two)).status).toBe("Cancelled");
    await f.review.approve(f.repo.main, made.feature);
    expect(f.inCommit()).toContain(path);
    expect(parseCard(f.repo.git(f.repo.main, "show", `HEAD:${path}`)).status).toBe("Cancelled");
    expect((await f.read(two)).status).toBe("Cancelled");
    expect((await f.read(one)).status).toBe("New");
    expect((await f.read(made.feature)).extra[LEGACY_BASELINE]).toBeUndefined();
    expect(f.status()).toEqual([]);
  });
});
