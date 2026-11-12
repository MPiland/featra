/**
 * Proven from CI (STORY-57). When a project's checks run in CI and it names the test report CI uploads, a story's
 * criteria are proven by that report: read once for the PR's head when its checks finish (again after a re-run), never
 * on every poll, and only through `gh`, so it costs no tokens. A report counts only for the commit the story's branch
 * is at (ADR 0032's rule for Verified). Its evidence goes through the same writer as every check (ADR 0004); what it
 * didn't prove, and why, is kept for the card.
 */
import {
  ciProof,
  unprovenLinked,
  type Card,
  type CheckOutcome,
  type CiProof,
  type ProjectConfig,
} from "@featra/work-format";
import { readCiReports, type CiReportDeps } from "./ci-report.ts";
import type { FoundPr } from "./github-prs.ts";
import { headIsStale } from "./pr-ci.ts";
import { keyOf } from "./story-prs-seen.ts";

export interface CiProvenDeps extends CiReportDeps {
  /** Writes evidence to the story's owner copy; false when nothing could be written (it left review, say). */
  record: (dir: string, id: string, outcome: CheckOutcome) => Promise<boolean> | boolean;
}

/** What is known of a story's PR head: whether its report was read since its checks last finished, and its proof. */
interface Head {
  head: string;
  read: boolean;
  proof: CiProof | null;
}

export function createCiProven(deps: CiProvenDeps) {
  const heads = new Map<string, Head>();

  /** Records every linked criterion of `card` not proven, and forgets its proof; true when the card showed one. */
  async function unprove(dir: string, card: Card, known: Head | undefined): Promise<boolean> {
    await deps.record(dir, card.id, unprovenLinked(card));
    const shown = known?.proof != null;
    if (known) Object.assign(known, { read: false, proof: null });
    return shown;
  }

  /**
   * Reads CI's report for `pr`'s head when its checks have finished and it wasn't read yet, and records what it
   * proves. A report proves only the commit it ran on, so a new head, or one the branch moved past, unproves every
   * linked criterion at once, the way Verified goes; the new head's report proves them again. True when what the card
   * shows changed.
   */
  async function read(dir: string, card: Card, config: ProjectConfig, pr: FoundPr): Promise<boolean> {
    const key = keyOf(dir, card.id);
    const artifact = config.testReportArtifact;
    // A report proves only the commit it ran on. With no head (gh gave no headRefOid) there is no commit to tie a
    // report to, so nothing is read and nothing is kept.
    if (!artifact || pr.head === null) return heads.delete(key);
    const was = heads.get(key);
    const moved = was !== undefined && was.head !== pr.head;
    const known: Head = !was || moved ? { head: pr.head, read: false, proof: null } : was;
    heads.set(key, known);
    const stale = await headIsStale(dir, card, pr, deps);
    const dropped = moved || stale ? (await unprove(dir, card, was)) || moved : false;
    // Checks running again on the same head (a re-run) mean a new report once they finish.
    if (pr.status.checks === "pending") known.read = false;
    if (stale || known.read || pr.status.checks === "pending" || pr.status.checks === "none") return dropped;
    const found = await readCiReports(dir, pr.head, { artifact, files: config.testReportFiles }, deps);
    if (!found || found.kind === "running" || heads.get(key) !== known) return dropped;
    const { acs, proof } = ciProof(card, found.reports.flat(), found.note);
    if (!(await deps.record(dir, card.id, { passed: null, acs }))) return dropped;
    known.read = true;
    known.proof = proof;
    return true;
  }

  /** The story came back into review at a commit past its PR's head: what that head's report proved goes now. */
  async function headMoved(dir: string, card: Card, config: ProjectConfig): Promise<void> {
    if (config.testReportArtifact) await unprove(dir, card, heads.get(keyOf(dir, card.id)));
  }

  return {
    read,
    headMoved,

    /** What the card shows of story `id`'s CI report, once read for its PR's head. */
    proofOf: (dir: string, id: string): CiProof | undefined => heads.get(keyOf(dir, id))?.proof ?? undefined,

    /** Forgets a closed project. */
    forget(dir: string) {
      for (const key of heads.keys()) if (key.startsWith(keyOf(dir, ""))) heads.delete(key);
    },
  };
}

export type CiProven = ReturnType<typeof createCiProven>;
