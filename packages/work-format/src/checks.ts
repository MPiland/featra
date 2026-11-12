/**
 * Where checks run and what a run proves (STORY-56): pure rules. A project's checks run in CI or on this computer.
 * On this computer Featra runs the project's check command in a story's worktree, which makes the story Verified or
 * not, and each acceptance criterion's linked test, which makes that criterion Proven or not (ADR 0004). The evidence
 * is written to the card's history by `system`, only when it changes, so a re-run adds nothing while nothing differs.
 */
import { settleDone } from "./acceptance.ts";
import { stageCeiling } from "./card-report.ts";
import { COMMAND_MAX, stageCategory } from "./config.ts";
import { evidenceState, provenEvent, UNVERIFIED, unprovenEvent, VERIFIED } from "./evidence.ts";
import { recordEvidence } from "./history.ts";
import type { ChecksWhere, GithubDetection } from "./checks-types.ts";
import { isRecord } from "./utils/guards.ts";
import type { Card, ProjectConfig } from "./types.ts";

export const CHECKS_COPY = {
  ci: "Public on GitHub with workflows, so CI runs the checks.",
  noGithub: "Not on GitHub, so checks run on this computer.",
  noWorkflows: "No GitHub workflows, so checks run on this computer.",
  notPublic: "Private on GitHub, where CI minutes are limited, so checks run on this computer.",
  unknown: "Couldn't tell if it's public on GitHub, so checks run on this computer.",
  notFeatra: "This folder isn't a Featra project.",
  noCommand: "No check command yet. Set one in Project settings.",
} as const;

/** Where checks run when the user hasn't chosen: CI only for a public GitHub repo with workflows, and why. */
export function defaultChecksWhere(found: GithubDetection): { where: ChecksWhere; reason: string } {
  if (!found.remote) return { where: "local", reason: CHECKS_COPY.noGithub };
  if (!found.workflows) return { where: "local", reason: CHECKS_COPY.noWorkflows };
  if (found.public === null) return { where: "local", reason: CHECKS_COPY.unknown };
  if (!found.public) return { where: "local", reason: CHECKS_COPY.notPublic };
  return { where: "ci", reason: CHECKS_COPY.ci };
}

/** Where the project's checks run: its own choice, else the default for what Featra found. */
export function checksWhere(config: ProjectConfig, found: GithubDetection): ChecksWhere {
  return config.checksWhere ?? defaultChecksWhere(found).where;
}

/**
 * The stage a story is reviewed in: the one before Acceptance when that is active and not the first active stage
 * (In Review by default), else Acceptance itself. Found by position, so a project may rename its stages.
 */
export function reviewStage(config: ProjectConfig): string | null {
  const ceiling = stageCeiling(config);
  if (ceiling === null) return null;
  const at = config.stages.findIndex((s) => s.name === ceiling);
  const before = config.stages[at - 1];
  const firstActive = config.stages.findIndex((s) => s.category === "active");
  return before && before.category === "active" && at - 1 !== firstActive ? before.name : ceiling;
}

/** Whether checks apply to `card` now: a story in its review stage or in Acceptance. Not while it is being built. */
export function checksApply(card: Card, config: ProjectConfig): boolean {
  if (card.type !== "story") return false;
  const names = config.stages.map((s) => s.name);
  const from = names.indexOf(reviewStage(config) ?? "");
  const to = names.indexOf(stageCeiling(config) ?? "");
  const at = names.indexOf(card.status);
  return from >= 0 && at >= from && at <= to && stageCategory(card.status, config) === "active";
}

/** What a finished run found: whether the check command passed, and each linked criterion's result. */
export interface CheckOutcome {
  /** Null when the check command wasn't run, so Verified stays as it was. */
  passed: boolean | null;
  /** AC number (1-based) and whether every test linked to it passed. */
  acs: readonly { ac: number; passed: boolean }[];
}

/**
 * The card with the run's evidence in its history, by `by`: Verified or not when the check command ran, and each
 * linked criterion Proven or not. Only changes are recorded. A story the user already accepted then moves to Done
 * when Verified arrives (`settleDone`). The same card, unchanged, when the run changes nothing.
 */
export function withCheckEvidence(card: Card, config: ProjectConfig, outcome: CheckOutcome, by: string, at: string) {
  const before = evidenceState(card);
  let next = card;
  if (outcome.passed === true && !before.verified) next = recordEvidence(next, VERIFIED, by, at);
  if (outcome.passed === false && before.verified) next = recordEvidence(next, UNVERIFIED, by, at);
  for (const { ac, passed } of outcome.acs) {
    if (ac < 1 || ac > card.acs.length) continue;
    const proven = before.provenAcs.includes(ac);
    if (passed && !proven) next = recordEvidence(next, provenEvent(ac), by, at);
    if (!passed && proven) next = recordEvidence(next, unprovenEvent(ac), by, at);
  }
  return next === card ? card : settleDone(next, config, by, at);
}

/** What the Dev Lead may propose: a check command, a linked-test command, or both. */
export interface ProposeInput {
  command?: string;
  testCommand?: string;
}

export const PROPOSE_MESSAGES = {
  none: "Give a check command, a linked test command, or both.",
  bad: (what: string) => `${what} must be one line of text, at most ${COMMAND_MAX} characters.`,
  proposed: "Proposed in Project settings. The user confirms it there; nothing runs until they do.",
} as const;

/** `v` trimmed when it is one line of text of a sensible length, else null. */
const oneLine = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" && !/[\r\n\0]/.test(v) && v.trim().length <= COMMAND_MAX ? v.trim() : null;

/** A `propose_check_command` call's input, or what to fix. */
export function parseProposeInput(input: unknown): { ok: true; value: ProposeInput } | { ok: false; error: string } {
  const raw = isRecord(input) ? input : {};
  const value: ProposeInput = {};
  if (raw.command !== undefined) {
    const command = oneLine(raw.command);
    if (command === null) return { ok: false, error: PROPOSE_MESSAGES.bad("The check command") };
    value.command = command;
  }
  if (raw.testCommand !== undefined) {
    const testCommand = oneLine(raw.testCommand);
    if (testCommand === null) return { ok: false, error: PROPOSE_MESSAGES.bad("The linked test command") };
    value.testCommand = testCommand;
  }
  return value.command === undefined && value.testCommand === undefined
    ? { ok: false, error: PROPOSE_MESSAGES.none }
    : { ok: true, value };
}
