/** STORY-51: Reject, and the main-checkout refusals both actions share. Real git, scanner and review. */
import { writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REVIEW_MESSAGES } from "../src/draft-review.ts";
import { input, draftFixture } from "./draft-review-fixture.ts";

const f = draftFixture();

describe("rejecting a draft", () => {
  it("deletes the feature and its stories, cancelled ones too, and leaves nothing in git", async () => {
    const { feature } = await f.draftWithCancelled();
    const at = f.head();
    const result = await f.review.reject(f.repo.main, feature);
    expect(result.removed).toBe(3);
    expect(await f.files()).toEqual([]);
    expect(f.status()).toEqual([]);
    expect(f.head()).toBe(at);
    expect(await readdir(f.cardsDir())).toEqual(["FEAT-1-card.md"]);
  });

  it("is refused when git tracks any of the files, deleting nothing", async () => {
    const feature = await f.draft();
    const story = (await f.files()).find((n) => n.startsWith("STORY-"));
    const tracked = `.featra/cards/${story}`;
    f.repo.git(f.repo.main, "add", tracked);
    const before = await f.files();
    await expect(f.review.reject(f.repo.main, feature)).rejects.toThrow(REVIEW_MESSAGES.tracked(feature, [tracked]));
    expect(await f.files()).toEqual(before);
    f.repo.git(f.repo.main, "commit", "-qm", "oops", "--", tracked);
    await expect(f.review.reject(f.repo.main, feature)).rejects.toThrow(/git tracks/);
    expect(await f.files()).toEqual(before);
  });

  it("is refused once the feature is approved, and a second reject finds it gone", async () => {
    const approved = await f.draft();
    await f.review.approve(f.repo.main, approved);
    await expect(f.review.reject(f.repo.main, approved)).rejects.toThrow(`${approved} is already approved.`);
    const other = (await f.writer.draft(f.repo.main, "chat-2", input)).feature;
    await f.review.reject(f.repo.main, other);
    await expect(f.review.reject(f.repo.main, other)).rejects.toThrow("That card is gone.");
  });

  it("is refused when main is on another branch, deleting nothing", async () => {
    const feature = await f.draft();
    f.repo.git(f.repo.main, "checkout", "-q", "-b", "other");
    const before = await f.files();
    await expect(f.review.reject(f.repo.main, feature)).rejects.toThrow(REVIEW_MESSAGES.noMain("main"));
    expect(await f.files()).toEqual(before);
  });

  it("leaves the chat's later draft_cards call free to draft again", async () => {
    const feature = await f.draft();
    await f.review.reject(f.repo.main, feature);
    const again = await f.writer.draft(f.repo.main, "chat-1", input);
    expect(again.stories).toHaveLength(2);
    expect(await f.files()).toHaveLength(3);
  });

  it("is refused on a detached HEAD, deleting nothing", async () => {
    const feature = await f.draft();
    f.repo.git(f.repo.main, "checkout", "-q", "--detach");
    const before = await f.files();
    await expect(f.review.reject(f.repo.main, feature)).rejects.toThrow(REVIEW_MESSAGES.detached("main"));
    expect(await f.files()).toEqual(before);
  });
});

describe("approving where main's checkout isn't ready", () => {
  it("is refused when main's checkout is on another branch, changing nothing", async () => {
    const feature = await f.draft();
    f.repo.git(f.repo.main, "checkout", "-q", "-b", "other");
    const at = f.head();
    await expect(f.review.approve(f.repo.main, feature)).rejects.toThrow(REVIEW_MESSAGES.noMain("main"));
    expect(f.head()).toBe(at);
    expect((await f.read(feature)).status).toBe("draft");
  });

  it("is refused on a detached HEAD, naming the branch to check out, changing nothing", async () => {
    const feature = await f.draft();
    f.repo.git(f.repo.main, "checkout", "-q", "--detach");
    const at = f.head();
    await expect(f.review.approve(f.repo.main, feature)).rejects.toThrow(
      "Main's checkout is detached. Check out main first.",
    );
    expect(f.head()).toBe(at);
    expect((await f.read(feature)).status).toBe("draft");
  });

  it("is refused in the middle of a merge", async () => {
    const feature = await f.draft();
    f.repo.git(f.repo.main, "checkout", "-q", "-b", "other");
    writeFileSync(join(f.repo.main, "README.md"), "other\n");
    f.repo.git(f.repo.main, "commit", "-qam", "other");
    f.repo.git(f.repo.main, "checkout", "-q", "main");
    writeFileSync(join(f.repo.main, "README.md"), "main\n");
    f.repo.git(f.repo.main, "commit", "-qam", "main");
    expect(() => f.repo.git(f.repo.main, "merge", "other")).toThrow("Command failed: git merge other");
    const at = f.head();
    await expect(f.review.approve(f.repo.main, feature)).rejects.toThrow(REVIEW_MESSAGES.midOperation("merge"));
    expect(f.head()).toBe(at);
    expect((await f.read(feature)).status).toBe("draft");
  });

  it("is refused in the middle of a rebase", async () => {
    const feature = await f.draft();
    f.repo.git(f.repo.main, "checkout", "-q", "-b", "other");
    writeFileSync(join(f.repo.main, "README.md"), "other\n");
    f.repo.git(f.repo.main, "commit", "-qam", "other");
    f.repo.git(f.repo.main, "checkout", "-q", "main");
    writeFileSync(join(f.repo.main, "README.md"), "main\n");
    f.repo.git(f.repo.main, "commit", "-qam", "main");
    expect(() => f.repo.git(f.repo.main, "rebase", "other")).toThrow("Command failed: git rebase other");
    // Whichever check sees it first refuses; the rebase check runs first, so it is named.
    await expect(f.review.approve(f.repo.main, feature)).rejects.toThrow(REVIEW_MESSAGES.midOperation("rebase"));
    expect((await f.read(feature)).status).toBe("draft");
  });
});
