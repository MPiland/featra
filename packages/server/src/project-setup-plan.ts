import { errorMessage, SETUP_ITEMS, type InitResult, type SetupItemId, type SetupPlan } from "@featra/work-format";
import type { Git } from "./git.ts";
import { scaffoldExists, setupStatus, writeScaffold } from "./project-setup.ts";

/**
 * One-screen setup (STORY-42): what the page needs to know before setup, and the one call that does it all. Git
 * comes first, then the chosen items; like Featra init, it only ever creates what is missing.
 */

/** Whether the folder is a repository, and which setup items are already there. */
export async function setupPlan(dir: string, git: Git): Promise<SetupPlan> {
  const status = await setupStatus(dir, git);
  if (status.state === "error") return { ok: false, error: status.error };
  try {
    const items = await Promise.all(
      SETUP_ITEMS.map(async (item) => ({ id: item.id, exists: await scaffoldExists(dir, item.entry) })),
    );
    return { ok: true, git: status.state !== "no-git", items };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** The created path that stands for `git init` in a result. */
export const GIT_CREATED = ".git/";

/**
 * Sets the project up in one pass: `git init` when the folder isn't in a repository, then the required items and the
 * chosen ones. A chosen item that is already there is kept; one offered only while missing is skipped if it appeared.
 */
export async function setUpProject(dir: string, chosen: readonly SetupItemId[], git: Git): Promise<InitResult> {
  const status = await setupStatus(dir, git);
  if (status.state === "error") return { ok: false, error: status.error };
  const created: string[] = [];
  try {
    if (status.state === "no-git") {
      await git.init(dir);
      created.push(GIT_CREATED);
    }
  } catch (err) {
    return { ok: false, error: `Can't initialize git: ${errorMessage(err)}` };
  }
  try {
    const items = SETUP_ITEMS.filter((item) => item.required || chosen.includes(item.id));
    const wanted = [];
    for (const item of items) {
      if (item.onlyWhenMissing && (await scaffoldExists(dir, item.entry))) continue;
      wanted.push(item.entry);
    }
    const written = await writeScaffold(dir, wanted);
    return { ok: true, created: [...created, ...written.created], kept: written.kept };
  } catch (err) {
    return { ok: false, error: `Can't set up the project: ${errorMessage(err)}` };
  }
}
