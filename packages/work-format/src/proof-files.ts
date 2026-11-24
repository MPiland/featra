/**
 * The screenshots Featra attaches to a story's criteria (STORY-25, ADR 0044): what it names them in the story's
 * evidence folder, and which screenshots the project's own tests wrote match which criterion.
 *
 * The matching rule: in the project's `testScreenshots` folder, a file named `<STORY-ID>-ac<n>.<ext>`, or
 * `<STORY-ID>-ac<n>-<anything>.<ext>`, is criterion n's (counted from 1), for a png, jpg, jpeg, gif or webp; case
 * doesn't matter. When several match one criterion, the first by name wins.
 */
import type { AcceptanceCriterion } from "./types.ts";

const SHOT_EXTENSIONS = "png|jpe?g|gif|webp";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Where Featra puts criterion `ac`'s (0-based) screenshot in `folder`: the captured page, or the test's copy. */
export const proofShotPath = (folder: string, ac: number, from: "page" | "test", ext: string): string =>
  `${folder}ac${ac + 1}-${from}.${ext}`;

/** Whether `path` is a screenshot Featra put in `folder`, which a newer one replaces; an agent's own file never is. */
export const isProofShot = (folder: string, path: string): boolean =>
  path.startsWith(folder) && new RegExp(`^ac\\d+-(page|test)\\.(${SHOT_EXTENSIONS})$`).test(path.slice(folder.length));

/** The test screenshots in `names` (file names in the folder) that match a criterion of `storyId`, by 0-based number. */
export function matchTestShots(storyId: string, names: readonly string[]): Map<number, string> {
  const rule = new RegExp(`^${escape(storyId)}-ac(\\d+)(?:-[^/\\\\]*)?\\.(${SHOT_EXTENSIONS})$`, "i");
  const out = new Map<number, string>();
  for (const name of names.toSorted()) {
    const n = Number(rule.exec(name)?.[1] ?? 0);
    if (n >= 1 && !out.has(n - 1)) out.set(n - 1, name);
  }
  return out;
}

/** What Featra attaches to one criterion: the page it captures, else the test's screenshot. */
export type ProofTarget = { ac: number; page: string } | { ac: number; testShot: string };

/**
 * The criteria Featra attaches a screenshot to, and from where: each criterion that lists a page, else has a matching
 * test screenshot. One whose evidence is the agent's own file keeps it.
 */
export function proofTargets(
  acs: readonly AcceptanceCriterion[],
  folder: string,
  testShots: ReadonlyMap<number, string>,
  capture: boolean,
): ProofTarget[] {
  return acs.flatMap((ac, i): ProofTarget[] => {
    if (ac.evidence && !isProofShot(folder, ac.evidence)) return [];
    if (capture && ac.page) return [{ ac: i, page: ac.page }];
    const shot = testShots.get(i);
    return shot ? [{ ac: i, testShot: shot }] : [];
  });
}
