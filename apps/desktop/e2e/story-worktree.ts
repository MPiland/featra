import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { parseCard } from "@featra/work-format";
import { git } from "./draft-project.ts";

/** The story card's file in `folder`, once it parses and names `branch`; else null. */
async function startedCard(folder: string, id: string, branch: string): Promise<string | null> {
  const cards = join(folder, ".featra", "cards");
  const name = (await readdir(cards).catch(() => [] as string[])).find((f) => f.startsWith(`${id}-`));
  if (!name) return null;
  try {
    const card = parseCard(await readFile(join(cards, name), "utf8"));
    return card.branch === branch ? join(cards, name) : null;
  } catch {
    return null;
  }
}

/**
 * The story Start made in the project `dir`: its branch, ID, worktree folder and card file. `git worktree add -b`
 * makes the branch before it checks the files out, so the branch alone doesn't mean the worktree is ready (BUG-26).
 * This waits for the card Start writes there last: In Progress, naming the story's branch.
 */
export async function startedStory(dir: string) {
  await expect.poll(() => git(dir, "branch", "--format=%(refname:short)")).toMatch(/featra\/story-\d+-draft-a-feature/);
  const branch =
    git(dir, "branch", "--format=%(refname:short)")
      .split("\n")
      .find((b) => b.startsWith("featra/story-")) ?? "";
  const id = `STORY-${/story-(\d+)-/.exec(branch)?.[1]}`;
  const folder = join(dir, ".claude", "worktrees", `${id}-draft-a-feature`);
  let file: string | null = null;
  await expect
    .poll(async () => (file = await startedCard(folder, id, branch)), {
      message: `${id}'s card in its worktree`,
      timeout: 30_000,
    })
    .not.toBeNull();
  return { branch, id, folder, file: file ?? "" };
}
