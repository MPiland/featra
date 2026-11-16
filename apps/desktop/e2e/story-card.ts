import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCard } from "@featra/work-format";

/**
 * The story card's file in the worktree `folder`, once it parses and names `branch`; else null (BUG-26). Start writes
 * that card last, after `git worktree add` returns, so the checked-out copy (`branch: null`) doesn't count. Kept apart
 * from Playwright so a unit test can run it.
 */
export async function startedCard(folder: string, id: string, branch: string): Promise<string | null> {
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
