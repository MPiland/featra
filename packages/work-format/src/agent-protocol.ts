/**
 * What an agent's MCP process says to the server (STORY-47, ADR 0019): a second, narrow socket beside the window's,
 * so an agent can log and nothing else. The same one-frame-per-message shape as `protocol.ts`, so answers parse with
 * `parseResponse`. Each connection is one chat's: the server knows which from the connection's token, never from the
 * params.
 */
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
}
export type AgentMethod = keyof AgentMethods;

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
  if (raw.method !== "log.append") return { id: raw.id, error: "Unknown method." };
  return { id: raw.id, method: raw.method, params: raw.params };
}
