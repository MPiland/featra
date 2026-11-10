/**
 * STORY-51: Approve and Reject. Real git repository, scanner, card actions, draft writer and review; the only fakes
 * are the clock and, for one test, the disk write. Git runs the repository's real hooks.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { baselineOf, parseCard, type Card, type DraftInput } from "@featra/work-format";
import { createCardActions, writeAtomic } from "../src/card-actions.ts";
import { createCardLane } from "../src/card-lane.ts";
import { createDraftReview, REVIEW_MESSAGES, type DraftReview } from "../src/draft-review.ts";
import { createDraftWriter, type DraftWriter } from "../src/draft-writer.ts";
import { gitEnv } from "../src/git-run.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";

let scanner: ReturnType<typeof createScanner>;
let writer: DraftWriter;
let review: DraftReview;
let repo: CardRepo;
let lane: ReturnType<typeof createCardLane>;
let diskWrite: ((file: string, text: string) => Promise<void>) | null;
const clock = new Date("2026-11-10T09:30:00Z");

beforeEach(async () => {
  diskWrite = null;
  scanner = createScanner(createRepoGit());
  lane = createCardLane();
  writer = createDraftWriter({ scan: scanner.scan, now: () => clock, lane });
  repo = await cardRepo();
  repo.git(repo.main, "config", "user.name", "Test");
  repo.git(repo.main, "config", "user.email", "test@example.invalid");
  repo.git(repo.main, "config", "commit.gpgsign", "false");
  await repo.write(repo.main, card("FEAT-1", "feature", null, "done"));
  writeFileSync(join(repo.main, "README.md"), "hello\n");
  repo.commit(repo.main, "plan");
  review = createDraftReview({
    scan: scanner.scan,
    now: () => clock,
    lane,
    write: (file, text) => (diskWrite ?? writeAtomic)(file, text),
  });
});
afterEach(async () => {
  await scanner.close();
  await repo.dispose();
});

const input: DraftInput = {
  feature: { title: "Shaping", description: "Talk a feature through." },
  stories: [
    { id: null, title: "One", story: "As a builder, I draft.", criteria: ["It drafts"], tasks: ["Build"] },
    { id: null, title: "Two", story: "As a builder, I review.", criteria: ["It reviews"], tasks: ["Build"] },
  ],
};
const cardsDir = () => join(repo.main, ".featra", "cards");
const files = async () => (await readdir(cardsDir())).filter((n) => !n.startsWith("FEAT-1-")).toSorted();
const read = async (id: string): Promise<Card> => {
  const name = (await readdir(cardsDir())).find((f) => f.startsWith(`${id}-`)) ?? "";
  return parseCard(await readFile(join(cardsDir(), name), "utf8"));
};
const lines = (text: string) => text.split(/\r?\n/).filter(Boolean);
const status = () =>
  lines(execFileSync("git", ["status", "--porcelain"], { cwd: repo.main, encoding: "utf8", env: gitEnv() }));
const head = () => repo.git(repo.main, "rev-parse", "HEAD");
const commitCount = () => Number(repo.git(repo.main, "rev-list", "--count", "HEAD"));
const inCommit = () => lines(repo.git(repo.main, "show", "--name-only", "--format=", "HEAD")).toSorted();
const hook = (body: string) => {
  const file = join(repo.main, ".git", "hooks", "pre-commit");
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
};
/** A draft of two stories, with the second one then cancelled by a revision. */
async function draftWithCancelled() {
  const made = await writer.draft(repo.main, "chat-1", input);
  const [one, two] = made.stories as [string, string];
  await writer.draft(repo.main, "chat-1", {
    ...input,
    stories: [{ ...input.stories[0]!, id: one }],
  });
  return { feature: made.feature, one, two };
}
const draft = async () => (await writer.draft(repo.main, "chat-1", input)).feature;

describe("approving a draft", () => {
  it("marks the feature approved, sets its baseline, and commits its cards to main with the message", async () => {
    const feature = await draft();
    const before = commitCount();
    const result = await review.approve(repo.main, feature);
    const approved = await read(feature);
    expect(approved.status).toBe("approved");
    expect(approved.history.at(-1)).toEqual({
      at: "2026-11-10T09:30:00Z",
      field: "status",
      from: "draft",
      to: "approved",
      by: "user",
    });
    expect(baselineOf(approved)?.stories).toHaveLength(2);
    expect(commitCount()).toBe(before + 1);
    expect(repo.git(repo.main, "log", "-1", "--format=%s")).toBe(`${feature}: approved Shaping`);
    expect(result.commit).toBe(repo.git(repo.main, "rev-parse", "--short", "HEAD"));
    expect(inCommit()).toEqual((await files()).map((n) => `.featra/cards/${n}`));
    expect(status()).toEqual([]);
    // The commit holds the approved card, byte for byte.
    expect(
      repo.git(repo.main, "show", `HEAD:.featra/cards/${(await files()).find((n) => n.startsWith(feature))}`),
    ).toBe(
      (await readFile(join(cardsDir(), (await files()).find((n) => n.startsWith(feature)) as string), "utf8")).trim(),
    );
  });

  it("leaves the stories at New", async () => {
    const feature = await draft();
    await review.approve(repo.main, feature);
    const stories = (await files()).filter((n) => n.startsWith("STORY-"));
    for (const name of stories) expect(parseCard(await readFile(join(cardsDir(), name), "utf8")).status).toBe("New");
  });

  it("never pushes: a remote hears nothing", async () => {
    const remote = join(repo.root, "remote.git");
    execFileSync("git", ["init", "-q", "--bare", remote], { env: gitEnv() });
    repo.git(repo.main, "remote", "add", "origin", remote);
    await review.approve(repo.main, await draft());
    expect(execFileSync("git", ["ls-remote", remote], { encoding: "utf8", env: gitEnv() })).toBe("");
  });

  it("deletes a story cancelled in draft rather than committing it", async () => {
    const { feature, one, two } = await draftWithCancelled();
    expect((await read(two)).status).toBe("Cancelled");
    await review.approve(repo.main, feature);
    expect(
      existsSync(join(cardsDir(), (await readdir(cardsDir())).find((n) => n.startsWith(`${two}-`)) ?? "none")),
    ).toBe(false);
    expect((await files()).some((n) => n.startsWith(`${two}-`))).toBe(false);
    expect(inCommit().some((p) => p.includes(`${two}-`))).toBe(false);
    expect(baselineOf(await read(feature))?.stories).toEqual([one]);
    expect(status()).toEqual([]);
  });

  it("commits only the draft's files: the user's staged, unstaged and untracked changes stay as they were", async () => {
    const feature = await draft();
    writeFileSync(join(repo.main, "staged.txt"), "staged\n");
    repo.git(repo.main, "add", "staged.txt");
    writeFileSync(join(repo.main, "README.md"), "hello, edited\n");
    writeFileSync(join(repo.main, "loose.txt"), "loose\n");
    await review.approve(repo.main, feature);
    expect(inCommit().every((p) => p.startsWith(".featra/cards/"))).toBe(true);
    expect(lines(repo.git(repo.main, "diff", "--cached", "--name-only"))).toEqual(["staged.txt"]);
    expect(lines(repo.git(repo.main, "diff", "--name-only"))).toEqual(["README.md"]);
    expect(status().toSorted()).toEqual(["?? loose.txt", " M README.md", "A  staged.txt"].toSorted());
  });

  it("runs the repo's hooks, and a failing hook rolls everything back: files exactly as before, no commit, nothing staged", async () => {
    const { feature, two } = await draftWithCancelled();
    const names = (await readdir(cardsDir())).toSorted();
    const bytes = new Map(await Promise.all(names.map(async (n) => [n, await readFile(join(cardsDir(), n))] as const)));
    const at = head();
    hook("echo 'hook says no' >&2\nexit 1");
    await expect(review.approve(repo.main, feature)).rejects.toThrow(/hook says no/);
    expect(head()).toBe(at);
    expect((await readdir(cardsDir())).toSorted()).toEqual(names);
    for (const [name, content] of bytes) expect((await readFile(join(cardsDir(), name))).equals(content)).toBe(true);
    expect((await read(feature)).status).toBe("draft");
    expect((await read(two)).status).toBe("Cancelled");
    expect(lines(repo.git(repo.main, "diff", "--cached", "--name-only"))).toEqual([]);
    expect(status().every((l) => l.startsWith("?? "))).toBe(true);
    // The hook is the only thing in the way: with it gone, the same draft approves.
    hook("exit 0");
    await review.approve(repo.main, feature);
    expect((await read(feature)).status).toBe("approved");
  });

  it("rolls back when the feature can't be written: nothing is deleted or committed", async () => {
    const { feature, two } = await draftWithCancelled();
    const at = head();
    diskWrite = async () => {
      throw new Error("disk full");
    };
    await expect(review.approve(repo.main, feature)).rejects.toThrow(/disk full/);
    expect(head()).toBe(at);
    expect((await read(feature)).status).toBe("draft");
    expect((await read(two)).status).toBe("Cancelled");
  });

  it("is refused when main's checkout is on another branch, changing nothing", async () => {
    const feature = await draft();
    repo.git(repo.main, "checkout", "-q", "-b", "other");
    const at = head();
    await expect(review.approve(repo.main, feature)).rejects.toThrow(REVIEW_MESSAGES.noMain("main"));
    expect(head()).toBe(at);
    expect((await read(feature)).status).toBe("draft");
  });

  it("is refused in the middle of a merge", async () => {
    const feature = await draft();
    repo.git(repo.main, "checkout", "-q", "-b", "other");
    writeFileSync(join(repo.main, "README.md"), "other\n");
    repo.git(repo.main, "commit", "-qam", "other");
    repo.git(repo.main, "checkout", "-q", "main");
    writeFileSync(join(repo.main, "README.md"), "main\n");
    repo.git(repo.main, "commit", "-qam", "main");
    expect(() => repo.git(repo.main, "merge", "other")).toThrow("Command failed: git merge other");
    const at = head();
    await expect(review.approve(repo.main, feature)).rejects.toThrow(REVIEW_MESSAGES.midOperation("merge"));
    expect(head()).toBe(at);
    expect((await read(feature)).status).toBe("draft");
  });

  it("is refused in the middle of a rebase", async () => {
    const feature = await draft();
    repo.git(repo.main, "checkout", "-q", "-b", "other");
    writeFileSync(join(repo.main, "README.md"), "other\n");
    repo.git(repo.main, "commit", "-qam", "other");
    repo.git(repo.main, "checkout", "-q", "main");
    writeFileSync(join(repo.main, "README.md"), "main\n");
    repo.git(repo.main, "commit", "-qam", "main");
    expect(() => repo.git(repo.main, "rebase", "other")).toThrow("Command failed: git rebase other");
    // A rebase detaches HEAD, so main isn't on its branch either: whichever check sees it first refuses.
    await expect(review.approve(repo.main, feature)).rejects.toThrow(/Main isn't checked out|middle of a rebase/);
    expect((await read(feature)).status).toBe("draft");
  });

  it("a second approve, even at the same moment, is refused: one commit, one approval", async () => {
    const feature = await draft();
    const before = commitCount();
    const [a, b] = await Promise.allSettled([review.approve(repo.main, feature), review.approve(repo.main, feature)]);
    expect([a.status, b.status].toSorted()).toEqual(["fulfilled", "rejected"]);
    const refused = [a, b].find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((refused.reason as Error).message).toBe(`${feature} is already approved.`);
    await expect(review.approve(repo.main, feature)).rejects.toThrow(`${feature} is already approved.`);
    expect(commitCount()).toBe(before + 1);
    expect((await read(feature)).history.filter((e) => e.to === "approved")).toHaveLength(1);
  });

  it("refuses a card that isn't a draft feature, a missing card, and a draft with every story cancelled", async () => {
    const made = await writer.draft(repo.main, "chat-1", input);
    const story = made.stories[0] as string;
    await expect(review.approve(repo.main, story)).rejects.toThrow(`${story} isn't a draft.`);
    await expect(review.approve(repo.main, "FEAT-99")).rejects.toThrow("That card is gone.");
    await expect(review.approve(repo.main, "FEAT-1")).rejects.toThrow("FEAT-1 isn't a draft.");
    expect(status().every((l) => l.startsWith("?? "))).toBe(true);
  });

  it("answers the drafting chat's next draft_cards call with the existing refusal", async () => {
    const feature = await draft();
    await review.approve(repo.main, feature);
    await expect(writer.draft(repo.main, "chat-1", input)).rejects.toThrow(
      `${feature} is already approved; drafts can't be changed after approval.`,
    );
    expect(await files()).toHaveLength(3);
  });

  it("a status edit through the card actions still can't approve it", async () => {
    const feature = await draft();
    const actions = createCardActions({ scan: scanner.scan, now: () => clock, lane });
    const r = await actions.update(repo.main, feature, { field: "status", from: "draft", to: "approved" });
    expect(r.ok).toBe(false);
    expect((await read(feature)).status).toBe("draft");
  });
});

describe("rejecting a draft", () => {
  it("deletes the feature and its stories, cancelled ones too, and leaves nothing in git", async () => {
    const { feature } = await draftWithCancelled();
    const at = head();
    const result = await review.reject(repo.main, feature);
    expect(result.removed).toBe(3);
    expect(await files()).toEqual([]);
    expect(status()).toEqual([]);
    expect(head()).toBe(at);
    expect(await readdir(cardsDir())).toEqual(["FEAT-1-card.md"]);
  });

  it("is refused when git tracks any of the files, deleting nothing", async () => {
    const feature = await draft();
    const story = (await files()).find((n) => n.startsWith("STORY-"));
    const tracked = `.featra/cards/${story}`;
    repo.git(repo.main, "add", tracked);
    const before = await files();
    await expect(review.reject(repo.main, feature)).rejects.toThrow(REVIEW_MESSAGES.tracked(feature, [tracked]));
    expect(await files()).toEqual(before);
    repo.git(repo.main, "commit", "-qm", "oops", "--", tracked);
    await expect(review.reject(repo.main, feature)).rejects.toThrow(/git tracks/);
    expect(await files()).toEqual(before);
  });

  it("is refused once the feature is approved, and a second reject finds it gone", async () => {
    const approved = await draft();
    await review.approve(repo.main, approved);
    await expect(review.reject(repo.main, approved)).rejects.toThrow(`${approved} is already approved.`);
    const other = (await writer.draft(repo.main, "chat-2", input)).feature;
    await review.reject(repo.main, other);
    await expect(review.reject(repo.main, other)).rejects.toThrow("That card is gone.");
  });

  it("is refused when main is on another branch, deleting nothing", async () => {
    const feature = await draft();
    repo.git(repo.main, "checkout", "-q", "-b", "other");
    const before = await files();
    await expect(review.reject(repo.main, feature)).rejects.toThrow(REVIEW_MESSAGES.noMain("main"));
    expect(await files()).toEqual(before);
  });

  it("leaves the chat's later draft_cards call free to draft again", async () => {
    const feature = await draft();
    await review.reject(repo.main, feature);
    const again = await writer.draft(repo.main, "chat-1", input);
    expect(again.stories).toHaveLength(2);
    expect(await files()).toHaveLength(3);
  });
});
