/**
 * The run that proved a criterion (STORY-69, ADR 0033): kept in the card's history with the proof, so its link
 * survives a restart. A `ran:<n>@<run>` evidence event follows the `proven:<n>` event it belongs to; `<run>` is a CI
 * run's URL, or `local` for a run on this computer. A later `proven` or `unproven` of the same criterion ends it, so a
 * run is only ever shown beside the proof it made. Pure.
 */
import type { JUnitCase } from "./junit.ts";
import { parseTestRefs } from "./check-commands.ts";
import { ciProofOf } from "./ci-proof.ts";
import { isRun } from "./card-view-types.ts";
import { proofStep } from "./evidence.ts";
import { prRepoPage } from "./prs-types.ts";
import type { Card } from "./types.ts";

export const ranEvent = (ac: number, run: string) => `ran:${ac}@${run}`;

/**
 * Each proven AC number (1-based) with the run that proved it, when one was recorded with its proof: the latest run
 * recorded since that proof, and only one `isRun` accepts for the card's PR.
 */
export function provenRuns(card: Pick<Card, "history" | "pr">): Map<number, string> {
  const runs = new Map<number, string>();
  const proven = new Set<number>();
  for (const e of card.history) {
    const step = proofStep(e);
    if (step) {
      runs.delete(step.ac);
      if (step.proven) proven.add(step.ac);
      else proven.delete(step.ac);
      continue;
    }
    const ran = e.field === "evidence" ? /^ran:(\d+)@(.+)$/.exec(e.to ?? "") : null;
    const ac = Number(ran?.[1]);
    if (ran && proven.has(ac) && isRun(ran[2], card.pr)) runs.set(ac, ran[2]);
  }
  return runs;
}

/** A workflow run's page, from the repository of the PR at `prUrl`; null when that isn't a GitHub PR. */
export function ciRunUrl(prUrl: string | null, run: number): string | null {
  const repo = prRepoPage(prUrl);
  return repo && Number.isSafeInteger(run) && run > 0 ? `${repo}/actions/runs/${run}` : null;
}

/** One CI run's report: the run's id and every test case its report files hold. */
export interface RunReport {
  run: number;
  cases: readonly JUnitCase[];
}

/**
 * The run that proves each of `acs` (AC numbers, 1-based): the first run whose own report has every test the AC links
 * passing; else, as the proof was read from the runs together, the newest run (highest id) whose report has at
 * least one of those tests passing; else none, so no link is shown.
 */
export function provingRuns(card: Card, runs: readonly RunReport[], acs: readonly number[]): Map<number, number> {
  const found = new Map<number, number>();
  const linked = card.acs.flatMap((criterion) => parseTestRefs(criterion.test).map((ref) => ref.file));
  const newestFirst = runs.toSorted((a, b) => b.run - a.run);
  for (const ac of acs) {
    const refs = parseTestRefs(card.acs[ac - 1]?.test ?? null);
    const proves = (r: RunReport) => refs.length > 0 && refs.every((ref) => ciProofOf(r.cases, ref, linked).proven);
    const holds = (r: RunReport) => refs.some((ref) => ciProofOf(r.cases, ref, linked).proven);
    const run = (runs.find(proves) ?? newestFirst.find(holds))?.run;
    if (run !== undefined) found.set(ac, run);
  }
  return found;
}
