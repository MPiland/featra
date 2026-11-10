/**
 * What an agent's MCP process says to the server (STORY-47, ADR 0019): a second, narrow socket beside the window's,
 * so an agent can log and draft cards and nothing else. The same one-frame-per-message shape as `protocol.ts`, so answers parse with
 * `parseResponse`. Each connection is one chat's: the server knows which from the connection's token, never from the
 * params.
 */
import type { DraftInput, DraftResult } from "./card-draft-input.ts";
import type { LogFile, LogInput } from "./knowledge-log.ts";
import { isRecord } from "./utils/guards.ts";

/** The path agents connect to. */
export const AGENT_PATH = "/v1/agent";

/** What a logged entry is called afterwards: its id, to Undo it, and the file it went to. */
export interface LoggedEntry {
  entry: string;
  file: LogFile;
}

export interface AgentMethods {
  /** Appends an entry to `decisions.md` or `open-questions.md` in the chat's working folder. */
  "log.append": { params: LogInput; result: LoggedEntry };
  /** Drafts a feature and its stories, or revises the chat's open draft in place (STORY-8). */
  "cards.draft": { params: DraftInput; result: DraftResult };
  /** Starts an approved feature: its branch, with the feature active on it, by the chat's session (STORY-52). */
  "feature.start": { params: { feature: string }; result: { branch: string } };
}
export type AgentMethod = keyof AgentMethods;
export const AGENT_METHODS = ["log.append", "cards.draft", "feature.start"] as const satisfies readonly AgentMethod[];

export interface AgentRequest {
  id: number;
  method: AgentMethod;
  params: unknown;
}

/** A request frame from an agent's MCP process, or why it can't be answered. */
export function parseAgentRequest(text: string): AgentRequest | { id: number | null; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = undefined;
  }
  if (!isRecord(raw) || typeof raw.id !== "number" || !Number.isSafeInteger(raw.id)) {
    return { id: null, error: "Malformed request." };
  }
  const method = AGENT_METHODS.find((m) => m === raw.method);
  if (!method) return { id: raw.id, error: "Unknown method." };
  return { id: raw.id, method, params: raw.params };
}
