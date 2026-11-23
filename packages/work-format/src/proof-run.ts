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
import type { Card } from "./types.ts";

export const ranEvent = (ac: number, run: string) => `ran:${ac}@${run}`;

/** Each proven AC number (1-based) with the run that proved it, when one was recorded with its proof. */
export function provenRuns(card: Pick<Card, "history">): Map<number, string> {
  const runs = new Map<number, string>();
  const proven = new Set<number>();
  for (const e of card.history) {
    if (e.field !== "evidence") continue;
    const to = e.to ?? "";
    const step = /^(proven|unproven):(\d+)(?:@\S+)?$/.exec(to);
    if (step) {
      const ac = Number(step[2]);
      runs.delete(ac);
      if (step[1] === "proven") proven.add(ac);
      else proven.delete(ac);
      continue;
    }
    const ran = /^ran:(\d+)@(.+)$/.exec(to);
    const ac = Number(ran?.[1]);
    if (ran?.[2] && proven.has(ac) && isRun(ran[2])) runs.set(ac, ran[2]);
  }
  return runs;
}

/** A workflow run's page, from the repository of the PR at `prUrl`; null when that isn't a GitHub PR. */
export function ciRunUrl(prUrl: string | null, run: number): string | null {
  const m = /^(https:\/\/github\.com\/[\w.-]+\/[\w.-]+)\/pull\/\d+$/.exec(prUrl ?? "");
  return m && Number.isSafeInteger(run) && run > 0 ? `${m[1]}/actions/runs/${run}` : null;
}

/** One CI run's report: the run's id and every test case its report files hold. */
export interface RunReport {
  run: number;
  cases: readonly JUnitCase[];
}

/**
 * The run that proves each of `acs` (AC numbers, 1-based): the first run whose own report has every test the AC links
 * passing, else the first run with a report at all, as the proof was read from them together.
 */
export function provingRuns(card: Card, runs: readonly RunReport[], acs: readonly number[]): Map<number, number> {
  const found = new Map<number, number>();
  const linked = card.acs.flatMap((criterion) => parseTestRefs(criterion.test).map((ref) => ref.file));
  const first = runs.find((r) => r.cases.length > 0)?.run;
  for (const ac of acs) {
    const refs = parseTestRefs(card.acs[ac - 1]?.test ?? null);
    const own = runs.find((r) => refs.length > 0 && refs.every((ref) => ciProofOf(r.cases, ref, linked).proven));
    const run = own?.run ?? first;
    if (run !== undefined) found.set(ac, run);
  }
  return found;
}
