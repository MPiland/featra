/**
 * Messages between the desktop host and the server child process, over Node's IPC channel (not the WebSocket).
 * The host starts the server with the token and keeps its list of open projects current; the server says where it
 * listens, acknowledges each list and forwards failures for the host's log.
 */
import { isRecord } from "@featra/work-format";

export type HostMessage = { type: "start"; token: string } | { type: "projects"; seq: number; dirs: string[] };

export type ServerMessage =
  | { type: "listening"; port: number }
  | { type: "projects-ack"; seq: number }
  | { type: "log"; message: string }
  | { type: "failed"; error: string };

const strings = (raw: unknown): raw is string[] => Array.isArray(raw) && raw.every((s) => typeof s === "string");

export function parseHostMessage(raw: unknown): HostMessage | null {
  if (!isRecord(raw)) return null;
  if (raw.type === "start" && typeof raw.token === "string" && raw.token) return { type: "start", token: raw.token };
  if (raw.type === "projects" && typeof raw.seq === "number" && strings(raw.dirs)) {
    return { type: "projects", seq: raw.seq, dirs: raw.dirs };
  }
  return null;
}

export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (!isRecord(raw)) return null;
  if (raw.type === "listening" && typeof raw.port === "number") return { type: "listening", port: raw.port };
  if (raw.type === "projects-ack" && typeof raw.seq === "number") return { type: "projects-ack", seq: raw.seq };
  if (raw.type === "log" && typeof raw.message === "string") return { type: "log", message: raw.message };
  if (raw.type === "failed" && typeof raw.error === "string") return { type: "failed", error: raw.error };
  return null;
}
