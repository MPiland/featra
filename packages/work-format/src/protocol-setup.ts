/**
 * The project setup shapes of the server's API (ADR 0015): where a folder stands and what init did, read defensively.
 * Part of protocol.ts's surface, which re-exports them.
 */
import { isOneOf, isRecord } from "./utils/guards.ts";

/** Where a project stands: not a git repository, a repository without `.featra/`, or set up. */
export type ProjectSetup =
  | { state: "no-git" }
  | { state: "no-featra" }
  | { state: "ready" }
  | { state: "error"; error: string };

/** What Featra init did: the paths it created and the ones it found and kept, relative to the project. */
export type InitResult = { ok: true; created: string[]; kept: string[] } | { ok: false; error: string };

const SETUP_STATES = ["no-git", "no-featra", "ready"] as const;

export function normalizeProjectSetup(raw: unknown): ProjectSetup {
  const r = isRecord(raw) ? raw : {};
  if (isOneOf(SETUP_STATES, r.state)) return { state: r.state };
  return { state: "error", error: typeof r.error === "string" && r.error ? r.error : "Something went wrong." };
}

const strings = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string") : [];

export function normalizeInitResult(raw: unknown): InitResult {
  const r = isRecord(raw) ? raw : {};
  if (r.ok === true) return { ok: true, created: strings(r.created), kept: strings(r.kept) };
  return { ok: false, error: typeof r.error === "string" && r.error ? r.error : "Something went wrong." };
}
