import { join } from "node:path";
import { expect } from "@playwright/test";
import { git } from "./draft-project.ts";
import { startedCard } from "./story-card.ts";

/** The story branch for `slug` in the project `dir`, its ID and its worktree folder, as they are now. */
export function storyOf(dir: string, slug: string) {
  const branch =
    git(dir, "branch", "--format=%(refname:short)")
      .split("\n")
      .find((b) => b.startsWith("featra/story-") && b.endsWith(`-${slug}`)) ?? "";
  const id = `STORY-${/story-(\d+)-/.exec(branch)?.[1]}`;
  return { branch, id, folder: join(dir, ".claude", "worktrees", `${id}-${slug}`) };
}

/**
 * The story Start made in the project `dir` for the story whose slug is `slug`: its branch, ID, worktree folder and
 * card file. `git worktree add -b` makes the branch before it checks the files out, so the branch alone doesn't mean
 * the worktree is ready (BUG-26). This waits for the card Start writes there last: parsed, naming the story's branch.
 */
export async function awaitStoryWorktree(dir: string, slug: string) {
  await expect
    .poll(() => git(dir, "branch", "--format=%(refname:short)"))
    .toMatch(new RegExp(`featra/story-\\d+-${slug}`));
  const { branch, id, folder } = storyOf(dir, slug);
  await expect
    .poll(() => startedCard(folder, id, branch), { message: `${id}'s card in its worktree`, timeout: 30_000 })
    .not.toBeNull();
  const file = await startedCard(folder, id, branch);
  if (file === null) throw new Error(`${id}'s card in ${folder} was there, then went away.`);
  return { branch, id, folder, file };
}
