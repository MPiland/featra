/**
 * Whether the base's checkout can take a feature's merge (STORY-14 review, ADR 0037). The base moves by `git merge
 * --ff-only` where it is checked out, which refuses only when a local change is in a file the move changes. So local
 * changes elsewhere, such as Featra's own edits to cards main owns (ADR 0017), never stop a merge; one in a file the
 * merge brings does, and is found here before anything is done.
 */
import type { FeatureLook } from "./feature-look.ts";
import type { MergeGit } from "./merge-git.ts";

/**
 * The files the base's checkout has changed locally that moving the base from `from` to the commits in `to` would
 * change too, the feature's card among them; none when the base isn't checked out.
 */
export async function baseInTheWay(git: MergeGit, look: FeatureLook, from: string, to: string[]): Promise<string[]> {
  const checkout = await git.checkoutOf(look.top, look.base);
  if (checkout === null) return [];
  const local = await git.uncommitted(checkout, "");
  if (local.length === 0) return [];
  const touched = new Set([look.path]);
  for (const commit of to) {
    const diff = await git.git(look.top, ["diff", "--name-only", "-z", "--no-renames", from, commit]);
    for (const file of diff.stdout.split("\0")) if (file) touched.add(file);
  }
  return local.filter((file) => touched.has(file));
}
