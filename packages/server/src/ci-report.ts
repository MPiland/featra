/**
 * CI's test report for a commit (STORY-57), fetched through the user's `gh` (ADR 0032): the workflow runs of the
 * commit (`gh run list --commit`), then the report artifact of each (`gh run download -p`) into a temp folder that is
 * removed after. Only the XML files the project's setting names are read, up to a total size. Fixed arguments plus
 * checked values only: the commit is hex, and the artifact pattern was checked when it was set.
 */
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CI_PROOF_COPY,
  isRecord,
  isReportArtifact,
  isReportFile,
  parseJUnit,
  type JUnitCase,
} from "@featra/work-format";
import { ghJson, runGh, type GhOptions } from "./gh-run.ts";
import type { GithubPrDeps } from "./github-prs.ts";

/** Where CI uploads its report: the artifact (a name or pattern) and the files inside it (a glob, or every `.xml`). */
export interface ReportSetting {
  artifact: string;
  files: string | null;
}

export interface CiReportDeps extends GithubPrDeps {
  /** The most bytes of report read, across every file of a commit's runs. */
  maxReportBytes?: number;
  /** How long one artifact's download may take. */
  downloadTimeoutMs?: number;
}

/** The runs of a commit still going, so its report isn't complete; or the reports read, with why there were none. */
export type CiReports = { kind: "running" } | { kind: "read"; reports: JUnitCase[][]; note: string | null };

const RUNS = ["databaseId", "status"].join(",");
/** How many of a commit's runs are read; a PR's head has a handful. */
const RUN_LIMIT = "20";
const MAX_REPORT_BYTES = 32 * 1024 * 1024;

/** `gh run download` says one of these when a run has no artifact matching the pattern (older and newer `gh`). */
const NO_ARTIFACT = /no (valid )?artifacts? (found|match)/i;

/** A run that is going and will upload its artifacts. One waiting for approval or a runner may never start. */
const GOING = new Set(["queued", "in_progress"]);
const status = (run: Record<string, unknown>) => String(run.status).toLowerCase();

/** The ids of a commit's finished runs, and whether any is still going; null when `gh` couldn't say. */
async function runsOf(dir: string, head: string, options: GhOptions) {
  if (!/^[0-9a-f]{7,64}$/.test(head)) return null;
  const args = ["run", "list", "--commit", head, "--json", RUNS, "--limit", RUN_LIMIT];
  const answer = await ghJson(dir, args, options);
  if (!Array.isArray(answer)) return null;
  const runs = (answer as unknown[]).filter(isRecord);
  const done = runs.filter((r) => status(r) === "completed");
  const ids = done.flatMap((r) => (typeof r.databaseId === "number" ? [r.databaseId] : []));
  return { ids, finished: !runs.some((r) => GOING.has(status(r))) };
}

/** The report files under `folder`: `<run>/<artifact>/<path>`, matched on the path inside the artifact. */
async function reportFiles(folder: string, files: string | null): Promise<string[]> {
  const all = await readdir(folder, { recursive: true }).catch(() => [] as string[]);
  return all
    .map((p) => p.replaceAll("\\", "/"))
    .filter((p) => {
      const inside = p.split("/").slice(2).join("/");
      return inside !== "" && isReportFile(files, inside);
    })
    .toSorted();
}

/**
 * The JUnit reports CI uploaded for `head`: `running` while any of its runs is queued or in progress, null when `gh` couldn't list or
 * download them (try again later). A run without the artifact adds nothing; none with it gives a note.
 */
export async function readCiReports(
  dir: string,
  head: string,
  setting: ReportSetting,
  deps: CiReportDeps = {},
): Promise<CiReports | null> {
  if (!isReportArtifact(setting.artifact)) return null;
  const options: GhOptions = { gh: deps.ghCommand, timeoutMs: deps.ghTimeoutMs };
  const runs = await runsOf(dir, head, options);
  if (!runs) return null;
  if (!runs.finished) return { kind: "running" };
  if (runs.ids.length === 0) return { kind: "read", reports: [], note: CI_PROOF_COPY.noRuns };
  const folder = await mkdtemp(join(tmpdir(), "featra-ci-report-"));
  try {
    for (const id of runs.ids) {
      const into = join(folder, String(id));
      const args = ["run", "download", String(id), "-p", setting.artifact, "-D", into];
      const r = await runGh(dir, args, { ...options, timeoutMs: deps.downloadTimeoutMs ?? 120_000 });
      if (!r) return null;
      if (r.code !== 0 && !NO_ARTIFACT.test(r.stderr)) return null;
    }
    const files = await reportFiles(folder, setting.files);
    if (files.length === 0) return { kind: "read", reports: [], note: CI_PROOF_COPY.noReport };
    let budget = deps.maxReportBytes ?? MAX_REPORT_BYTES;
    let note: string | null = null;
    const reports: JUnitCase[][] = [];
    for (const file of files) {
      const path = join(folder, file);
      const size = (await stat(path)).size;
      if (size > budget) {
        note = CI_PROOF_COPY.tooLarge;
        continue;
      }
      budget -= size;
      reports.push(parseJUnit(await readFile(path, "utf8")));
    }
    return { kind: "read", reports, note };
  } finally {
    await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
