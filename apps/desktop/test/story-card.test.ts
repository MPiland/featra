import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newCard, serializeCard } from "@featra/work-format";
import { startedCard } from "../e2e/story-card.ts";

// BUG-26: the e2e wait for a story's worktree counts only the card Start writes there, not the checked-out copy.

const BRANCH = "featra/story-1-draft-a-feature";
let folder: string;
const cards = () => join(folder, ".featra", "cards");

async function put(name: string, text: string) {
  await mkdir(cards(), { recursive: true });
  await writeFile(join(cards(), name), text, "utf8");
}

const story = (id: string, branch: string | null) =>
  serializeCard({
    ...newCard({ id, type: "story", title: "Draft a feature", status: "In Progress" }, "user", "2026-11-15T00:00:00Z"),
    branch,
  });

beforeEach(async () => {
  folder = await realpath(await mkdtemp(join(tmpdir(), "featra-story-card-")));
});
afterEach(() => rm(folder, { recursive: true, force: true }));

describe("the story card a worktree wait accepts (BUG-26)", () => {
  it("is none while the worktree has no cards folder", async () => {
    expect(await startedCard(folder, "STORY-1", BRANCH)).toBeNull();
  });

  it("is none for a longer ID with the same prefix", async () => {
    await put("STORY-12-draft-a-feature.md", story("STORY-12", BRANCH));
    expect(await startedCard(folder, "STORY-1", BRANCH)).toBeNull();
  });

  it("is none for the checked-out copy, which names no branch", async () => {
    await put("STORY-1-draft-a-feature.md", story("STORY-1", null));
    expect(await startedCard(folder, "STORY-1", BRANCH)).toBeNull();
  });

  it("is none for a card that doesn't parse", async () => {
    // Half written: it names the branch, but its frontmatter is cut off.
    const whole = story("STORY-1", BRANCH);
    await put("STORY-1-draft-a-feature.md", whole.slice(0, whole.indexOf("created:")));
    expect(await startedCard(folder, "STORY-1", BRANCH)).toBeNull();
  });

  it("is the card's path once it names the story's branch", async () => {
    await put("STORY-1-draft-a-feature.md", story("STORY-1", BRANCH));
    expect(await startedCard(folder, "STORY-1", BRANCH)).toBe(join(cards(), "STORY-1-draft-a-feature.md"));
  });
});
