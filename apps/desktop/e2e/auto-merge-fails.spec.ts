import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { parseCard } from "@featra/work-format";
import { git } from "./draft-project.ts";
import { githubApp, provenStory } from "./proven-story.ts";

/**
 * STORY-60: an automatic merge that fails, in the world of proven-story.ts. The story goes to review (its PR opens),
 * CI's checks pass and its report proves every criterion, so it tries to merge on its own; GitHub refuses the merge for
 * the feature branch's rules. Nothing merges, the story stays in review, and its card and session say why.
 */
const BRANCH_RULE = "X Pull request acme/app#1 is not mergeable: the base branch policy prohibits the merge.";

test("A story that can't merge on its own says why on its card and in its session", async () => {
  const world = await githubApp({ mergeFails: BRANCH_RULE });
  try {
    const { page, remote, gh } = world;
    const { row, card, id, file, story, base } = await provenStory(world);

    // AC3, AC4: GitHub refuses the merge. The story stays in review, untried again, and its card says why.
    const why = /Didn't merge on its own\. .*base branch policy prohibits the merge/;
    await expect(card.getByRole("status").filter({ hasText: why })).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole("button", { name: "Status: In Review" })).toBeVisible();
    await expect(row).not.toContainText("Merged");
    expect((await gh.calls()).filter((c) => c.args.slice(0, 2).join(" ") === "pr merge")).toHaveLength(1);
    expect(git(remote, "rev-parse", "feature/2-shaping")).toBe(base);
    const saved = parseCard(await readFile(file, "utf8"));
    expect(saved.history.findLast((e) => e.field === "not-merged")).toMatchObject({ from: story, by: "system" });

    // AC4: its session says so too.
    await row.getByRole("button", { name: `Open the session of ${id}` }).click();
    const session = page.getByRole("region", { name: "Developer" });
    await expect(session.getByRole("status").filter({ hasText: why })).toBeVisible();
  } finally {
    await world.dispose();
  }
});
