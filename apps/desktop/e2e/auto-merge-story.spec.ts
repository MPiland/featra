import { existsSync } from "node:fs";
import { relative } from "node:path";
import { expect, test } from "@playwright/test";
import { parseCard } from "@featra/work-format";
import { git } from "./draft-project.ts";
import { githubApp, provenStory } from "./proven-story.ts";
import { uxShot } from "./ux-shot.ts";

/**
 * STORY-59: a Verified and Proven story merges into its feature on its own, in the world of proven-story.ts.
 * Auto-merge is on by default in Settings. The story goes to review (its PR opens), CI's checks pass and its report
 * proves every criterion, and the story merges with a merge commit without Merge or Accept.
 */
test("A Verified and Proven story merges into its feature on its own", async () => {
  const world = await githubApp();
  try {
    const { page, repo, remote, gh } = world;
    const nav = page.getByRole("navigation", { name: "Featra" });

    // AC4: Auto-merge is on by default, under the project's Workflow settings.
    await nav.getByRole("button", { name: "Settings" }).click();
    await page
      .getByRole("navigation", { name: "Settings pages" })
      .getByRole("list", { name: "Project" })
      .getByRole("button", { name: "Workflow" })
      .click();
    const review = page.getByRole("region", { name: "Progress and review" });
    await expect(review.getByRole("switch", { name: "Auto-merge stories" })).toHaveAttribute("aria-checked", "true");
    await uxShot(page, "feat-8-settings-auto-merge-on", review);

    // AC1, AC3: the story goes to review, and CI's checks pass with a report that proves every criterion.
    const { row, id, folder, file, story, base } = await provenStory(world);

    // It merges on its own: no Merge, no Accept. The PR merges with a merge commit at the head CI checked.
    await expect(row).toContainText("Merged", { timeout: 30_000 });
    await uxShot(page, "feat-8-work-merged-on-its-own", row);
    const merged = (await gh.calls()).find((c) => c.args.slice(0, 2).join(" ") === "pr merge");
    expect(merged?.args).toEqual([
      "pr",
      "merge",
      "https://github.com/acme/app/pull/1",
      "--merge",
      "--match-head-commit",
      story,
    ]);
    expect(git(remote, "log", "-1", "--format=%P", "feature/2-shaping").split(" ")).toEqual([base, story]);
    await expect(row.getByRole("button", { name: `Merge ${id}` })).toHaveCount(0);
    await expect.poll(() => existsSync(folder), { timeout: 30_000 }).toBe(false);
    const path = relative(folder, file).replace(/\\/g, "/");
    const onFeature = parseCard(git(repo.dir, "show", `feature/2-shaping:${path}`));
    expect(onFeature.history.findLast((e) => e.field === "merged")?.by).toBe("system");
    expect(onFeature.history.some((e) => e.field === "accepted")).toBe(false);
  } finally {
    await world.dispose();
  }
});
