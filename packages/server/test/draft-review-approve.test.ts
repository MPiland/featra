/**
 * STORY-51: Approve. Real git repository, scanner, card actions, draft writer and review; the only fakes are the clock
 * and, in the rollback tests, the disk write. Git runs the repository's real hooks.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { baselineOf, parseCard } from "@featra/work-format";
import { createCardActions } from "../src/card-actions.ts";
import { gitEnv } from "../src/git-run.ts";
import { clock, input, lines, draftFixture } from "./draft-review-fixture.ts";

const f = draftFixture();

describe("approving a draft", () => {
  it("marks the feature approved, sets its baseline, and commits its cards to main with the message", async () => {
    const feature = await f.draft();
    const before = f.commitCount();
    const result = await f.review.approve(f.repo.main, feature);
    const approved = await f.read(feature);
    expect(approved.status).toBe("approved");
    expect(approved.history.at(-1)).toEqual({
      at: "2026-11-10T09:30:00Z",
      field: "status",
      from: "draft",
      to: "approved",
      by: "user",
    });
    expect(baselineOf(approved)?.stories).toHaveLength(2);
    expect(f.commitCount()).toBe(before + 1);
    expect(f.repo.git(f.repo.main, "log", "-1", "--format=%s")).toBe(`${feature}: approved Shaping`);
    expect(result.commit).toBe(f.repo.git(f.repo.main, "rev-parse", "--short", "HEAD"));
    expect(f.inCommit()).toEqual((await f.files()).map((n) => `.featra/cards/${n}`));
    expect(f.status()).toEqual([]);
    // The commit holds the approved card, byte for byte.
    const name = (await f.files()).find((n) => n.startsWith(feature)) as string;
    expect(f.repo.git(f.repo.main, "show", `HEAD:.featra/cards/${name}`)).toBe(
      (await readFile(join(f.cardsDir(), name), "utf8")).trim(),
    );
  });

  it("leaves the stories at New", async () => {
    const feature = await f.draft();
    await f.review.approve(f.repo.main, feature);
    const stories = (await f.files()).filter((n) => n.startsWith("STORY-"));
    for (const name of stories) expect(parseCard(await readFile(join(f.cardsDir(), name), "utf8")).status).toBe("New");
  });

  it("never pushes: a remote hears nothing", async () => {
    const remote = join(f.repo.root, "remote.git");
    execFileSync("git", ["init", "-q", "--bare", remote], { env: gitEnv() });
    f.repo.git(f.repo.main, "remote", "add", "origin", remote);
    await f.review.approve(f.repo.main, await f.draft());
    expect(execFileSync("git", ["ls-remote", remote], { encoding: "utf8", env: gitEnv() })).toBe("");
  });

  it("deletes a story cancelled in draft rather than committing it", async () => {
    const { feature, one, two } = await f.draftWithCancelled();
    expect((await f.read(two)).status).toBe("Cancelled");
    await f.review.approve(f.repo.main, feature);
    expect(
      existsSync(join(f.cardsDir(), (await readdir(f.cardsDir())).find((n) => n.startsWith(`${two}-`)) ?? "none")),
    ).toBe(false);
    expect((await f.files()).some((n) => n.startsWith(`${two}-`))).toBe(false);
    expect(f.inCommit().some((p) => p.includes(`${two}-`))).toBe(false);
    expect(baselineOf(await f.read(feature))?.stories).toEqual([one]);
    expect(f.status()).toEqual([]);
  });

  it("commits only the draft's files: the user's staged, unstaged and untracked changes stay as they were", async () => {
    const feature = await f.draft();
    writeFileSync(join(f.repo.main, "staged.txt"), "staged\n");
    f.repo.git(f.repo.main, "add", "staged.txt");
    writeFileSync(join(f.repo.main, "README.md"), "hello, edited\n");
    writeFileSync(join(f.repo.main, "loose.txt"), "loose\n");
    await f.review.approve(f.repo.main, feature);
    expect(f.inCommit().every((p) => p.startsWith(".featra/cards/"))).toBe(true);
    expect(lines(f.repo.git(f.repo.main, "diff", "--cached", "--name-only"))).toEqual(["staged.txt"]);
    expect(lines(f.repo.git(f.repo.main, "diff", "--name-only"))).toEqual(["README.md"]);
    expect(f.status().toSorted()).toEqual(["?? loose.txt", " M README.md", "A  staged.txt"].toSorted());
  });

  it("a second approve, even at the same moment, is refused: one commit, one approval", async () => {
    const feature = await f.draft();
    const before = f.commitCount();
    const [a, b] = await Promise.allSettled([
      f.review.approve(f.repo.main, feature),
      f.review.approve(f.repo.main, feature),
    ]);
    expect([a.status, b.status].toSorted()).toEqual(["fulfilled", "rejected"]);
    const refused = [a, b].find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((refused.reason as Error).message).toBe(`${feature} is already approved.`);
    await expect(f.review.approve(f.repo.main, feature)).rejects.toThrow(`${feature} is already approved.`);
    expect(f.commitCount()).toBe(before + 1);
    expect((await f.read(feature)).history.filter((e) => e.to === "approved")).toHaveLength(1);
  });

  it("refuses a card that isn't a draft feature, a missing card, and a draft with every story cancelled", async () => {
    const made = await f.writer.draft(f.repo.main, "chat-1", input);
    const story = made.stories[0] as string;
    await expect(f.review.approve(f.repo.main, story)).rejects.toThrow(`${story} isn't a draft.`);
    await expect(f.review.approve(f.repo.main, "FEAT-99")).rejects.toThrow("That card is gone.");
    await expect(f.review.approve(f.repo.main, "FEAT-1")).rejects.toThrow("FEAT-1 isn't a draft.");
    expect(f.status().every((l) => l.startsWith("?? "))).toBe(true);
  });

  it("answers the drafting chat's next draft_cards call with the existing refusal", async () => {
    const feature = await f.draft();
    await f.review.approve(f.repo.main, feature);
    await expect(f.writer.draft(f.repo.main, "chat-1", input)).rejects.toThrow(
      `${feature} is already approved; drafts can't be changed after approval.`,
    );
    expect(await f.files()).toHaveLength(3);
  });

  it("a status edit through the card actions still can't approve it", async () => {
    const feature = await f.draft();
    const actions = createCardActions({ scan: f.scanner.scan, now: () => clock, lane: f.lane });
    const r = await actions.update(f.repo.main, feature, { field: "status", from: "draft", to: "approved" });
    expect(r.ok).toBe(false);
    expect((await f.read(feature)).status).toBe("draft");
  });
});
