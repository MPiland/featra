/**
 * Where a project's checks run and what the card and Project settings show about them (STORY-56). Types and the
 * checks for data that crosses the socket only, so the client can import it without the card parser.
 */
import { isOneOf, isRecord } from "./utils/guards.ts";

/** CI (the project's own pipeline, read through GitHub) or this computer (Featra runs the check command). */
export type ChecksWhere = "ci" | "local";
export const CHECKS_WHERE: readonly ChecksWhere[] = ["ci", "local"];

/** What Featra found about GitHub for a project: a GitHub remote, workflow files, and whether the repo is public. */
export interface GithubDetection {
  remote: boolean;
  workflows: boolean;
  /** Null when it couldn't be told: `gh` missing, signed out, or failing. Treated as not public. */
  public: boolean | null;
}

/** The two commands a project sets; each is null until the user confirms one. */
export type CheckField = "command" | "testCommand";

/** A command someone proposed and the user hasn't confirmed: from the project's files, or from the Dev Lead. */
export interface CheckProposal {
  field: CheckField;
  value: string;
  source: "package.json" | "dev-lead";
}

/** Project settings' Checks section. */
export interface ChecksView {
  /** Where checks run now: the user's choice, else the default. */
  where: ChecksWhere;
  /** Whether the user chose it; false when it is the default, which `reason` explains. */
  chosen: boolean;
  /** Why the default is what it is. */
  reason: string;
  command: string | null;
  testCommand: string | null;
  proposals: CheckProposal[];
  /** Set when the project's config can't be read; nothing is changed then. */
  error: string | null;
}

/** One change to the checks settings; `null` clears a value (the default applies again), absent leaves it. */
export interface ChecksPatch {
  where?: ChecksWhere | null;
  command?: string | null;
  testCommand?: string | null;
}

/** A finished run, for the card: its command, when it ended, and the tail of what it printed. */
export interface CheckResult {
  passed: boolean;
  command: string;
  at: string;
  /** The end of the output (bounded), which is where a failure says why. */
  output: string;
}

/** What the card pane shows about a story's checks on this computer. */
export interface CardChecks {
  running: boolean;
  /** Why nothing runs (no check command yet), else null. */
  idle: string | null;
  last: CheckResult | null;
  /** AC numbers (1-based) whose linked test failed in the last run. */
  failedAcs: number[];
  /** The last run's own words about linked tests that couldn't run (no command set, file missing), else null. */
  note: string | null;
}

const text = (v: unknown) => (typeof v === "string" ? v : "");
const textOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);

export function normalizeCardChecks(raw: unknown): CardChecks | undefined {
  if (!isRecord(raw)) return undefined;
  const last = isRecord(raw.last)
    ? {
        passed: raw.last.passed === true,
        command: text(raw.last.command),
        at: text(raw.last.at),
        output: text(raw.last.output),
      }
    : null;
  return {
    running: raw.running === true,
    idle: textOrNull(raw.idle),
    last,
    failedAcs: Array.isArray(raw.failedAcs) ? raw.failedAcs.filter((n): n is number => typeof n === "number") : [],
    note: textOrNull(raw.note),
  };
}

export function normalizeChecksView(raw: unknown): ChecksView {
  const r = isRecord(raw) ? raw : {};
  return {
    where: isOneOf(CHECKS_WHERE, r.where) ? r.where : "local",
    chosen: r.chosen === true,
    reason: text(r.reason),
    command: textOrNull(r.command),
    testCommand: textOrNull(r.testCommand),
    proposals: (Array.isArray(r.proposals) ? (r.proposals as unknown[]) : [])
      .filter(isRecord)
      .flatMap((p): CheckProposal[] => {
        const field = p.field === "command" || p.field === "testCommand" ? p.field : null;
        const source = p.source === "package.json" || p.source === "dev-lead" ? p.source : null;
        return field && source && typeof p.value === "string" && p.value ? [{ field, value: p.value, source }] : [];
      }),
    error: textOrNull(r.error),
  };
}

/** A `ChecksPatch` read from the socket, or null when it isn't one. */
export function parseChecksPatch(raw: unknown): ChecksPatch | null {
  if (!isRecord(raw)) return null;
  const patch: ChecksPatch = {};
  if ("where" in raw) {
    if (raw.where !== null && !isOneOf(CHECKS_WHERE, raw.where)) return null;
    patch.where = raw.where;
  }
  for (const key of ["command", "testCommand"] as const) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (value !== null && typeof value !== "string") return null;
    patch[key] = value;
  }
  return patch;
}

/** The `{ dir, patch }` params of `checks.set`, or null. */
export function checksSetParams(params: unknown): { dir: string; patch: ChecksPatch } | null {
  if (!isRecord(params) || typeof params.dir !== "string" || !params.dir) return null;
  const patch = parseChecksPatch(params.patch);
  return patch ? { dir: params.dir, patch } : null;
}
