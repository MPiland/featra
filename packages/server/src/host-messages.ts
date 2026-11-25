/**
 * Messages between the desktop host and the server child process, over Node's IPC channel (not the WebSocket).
 * The host starts the server with the token, keeps its list of open projects current and says when the app's settings
 * are saved; the server says where it
 * listens, acknowledges each list, forwards failures for the host's log and tells how many agents wait on the user
 * across the open projects, for the taskbar and Dock badge (STORY-67). The server also asks the host to capture a page of a
 * story's dev server (`capture`), which Electron's own Chromium does, and the host answers `captured` (STORY-25).
 */
import { isRecord } from "@featra/work-format";

/** `settings`: the host saved the app's settings, which the server reads from the data folder as it needs them. */
export type HostMessage =
  | { type: "start"; token: string }
  | { type: "projects"; seq: number; dirs: string[] }
  | { type: "settings" }
  /** The page captured, as base64 png or jpg; or `error` when it couldn't be (it didn't load). */
  | { type: "captured"; seq: number; data: string; ext: "png" | "jpg" }
  | { type: "captured"; seq: number; error: string };

export type ServerMessage =
  | { type: "listening"; port: number }
  | { type: "projects-ack"; seq: number }
  | { type: "log"; message: string }
  | { type: "failed"; error: string }
  | { type: "waiting"; count: number }
  /** `origin` is the dev server's: the host loads `url` only on it. */
  | { type: "capture"; seq: number; url: string; origin: string };

/** True for a whole number JavaScript holds exactly, narrowing it to a number. */
const wholeNumber = (value: unknown): value is number => Number.isSafeInteger(value);

const strings = (raw: unknown): raw is string[] => Array.isArray(raw) && raw.every((s) => typeof s === "string");

export function parseHostMessage(raw: unknown): HostMessage | null {
  if (!isRecord(raw)) return null;
  if (raw.type === "start" && typeof raw.token === "string" && raw.token) return { type: "start", token: raw.token };
  if (raw.type === "projects" && typeof raw.seq === "number" && strings(raw.dirs)) {
    return { type: "projects", seq: raw.seq, dirs: raw.dirs };
  }
  if (raw.type === "settings") return { type: "settings" };
  if (raw.type === "captured" && wholeNumber(raw.seq)) {
    if (typeof raw.error === "string") return { type: "captured", seq: raw.seq, error: raw.error };
    if (typeof raw.data === "string" && raw.data && (raw.ext === "png" || raw.ext === "jpg")) {
      return { type: "captured", seq: raw.seq, data: raw.data, ext: raw.ext };
    }
  }
  return null;
}

export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (!isRecord(raw)) return null;
  if (raw.type === "listening" && typeof raw.port === "number") return { type: "listening", port: raw.port };
  if (raw.type === "projects-ack" && typeof raw.seq === "number") return { type: "projects-ack", seq: raw.seq };
  if (raw.type === "log" && typeof raw.message === "string") return { type: "log", message: raw.message };
  if (raw.type === "failed" && typeof raw.error === "string") return { type: "failed", error: raw.error };
  if (raw.type === "waiting" && wholeNumber(raw.count) && raw.count >= 0) {
    return { type: "waiting", count: raw.count };
  }
  if (raw.type === "capture" && wholeNumber(raw.seq) && typeof raw.url === "string" && typeof raw.origin === "string") {
    return { type: "capture", seq: raw.seq, url: raw.url, origin: raw.origin };
  }
  return null;
}
