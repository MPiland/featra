/**
 * Evidence files (STORY-10, STORY-72): where a card's evidence lives, which links to it are allowed, and how the app
 * reads one back to show it next to its criterion (ADR 0043). Pure and light, so the client can import it.
 */
import { parseId } from "./ids.ts";
import type { Card } from "./types.ts";
import { isOneOf, isRecord } from "./utils/guards.ts";

/** The largest evidence file a report may link, and the app reads back. */
export const EVIDENCE_BYTES = 1_000_000;

/** The folder of a card's evidence, `.featra/evidence/FEAT-N/STORY-M/`, or null when it has no feature. */
export function evidenceFolder(card: Pick<Card, "id" | "parent">): string | null {
  const feature = card.parent ? parseId(card.parent) : null;
  const own = parseId(card.id);
  return feature && own ? `.featra/evidence/${feature.prefix}-${feature.n}/${own.prefix}-${own.n}/` : null;
}

const PATH_CHARS = /^[A-Za-z0-9._\-/]+$/;

/** Why `path` can't be an evidence link of `card`, or null when it is a file inside the card's evidence folder. */
export function evidenceLinkError(card: Pick<Card, "id" | "parent">, path: string): string | null {
  const folder = evidenceFolder(card);
  if (folder === null) return `${card.id} has no feature, so it has no evidence folder.`;
  const inside = `Evidence goes in ${folder}`;
  if (!PATH_CHARS.test(path)) return `${inside} and its path uses only letters, digits, . _ - and /.`;
  const rest = path.startsWith(folder) ? path.slice(folder.length) : null;
  if (rest === null || rest === "") return `${inside}: link a file there.`;
  if (rest.split("/").some((part) => part === "" || part === "." || part === ".." || part.startsWith("."))) {
    return `${inside}: no empty, hidden or relative parts in the path.`;
  }
  return null;
}

/** The file's name: the last part of its path. */
export const evidenceName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** The file's extension, lower case, without the dot; empty when it has none. */
export const evidenceExtension = (path: string): string => {
  const name = evidenceName(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/** The screenshots shown as a thumbnail, by extension, with their media type. */
const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** The media type of an evidence screenshot, or null when the file isn't one the app shows as an image. */
export const evidenceImageType = (path: string): string | null => IMAGE_TYPES[evidenceExtension(path)] ?? null;

/**
 * The kinds of file the app hands to the OS to open (ADR 0043): documents and images, never anything that runs. Any
 * other file is shown in its folder instead.
 */
export const EVIDENCE_OPENABLE: readonly string[] = [
  ...Object.keys(IMAGE_TYPES),
  "txt",
  "md",
  "log",
  "json",
  "csv",
  "tsv",
  "xml",
  "yaml",
  "yml",
  "pdf",
];

/** The folder, inside the app's data folder, that holds the copies of evidence files opened with the OS. */
export const EVIDENCE_OPEN_DIR = "evidence-open";

/** Why a linked file can't be shown: it isn't there, or it can't be read (outside its folder, too big, not a file). */
export type EvidenceProblem = "missing" | "unreadable";
const PROBLEMS: readonly EvidenceProblem[] = ["missing", "unreadable"];

/** An evidence file as the app reads it back: a screenshot with its bytes, any other file by name, or why not. */
export type EvidenceFile =
  | { ok: true; kind: "image"; name: string; mime: string; data: string }
  | { ok: true; kind: "file"; name: string }
  | { ok: false; problem: EvidenceProblem };

/** Short notes shown in place of evidence that can't be shown. */
export const EVIDENCE_COPY = {
  missing: "Evidence missing",
  unreadable: "Can't open evidence",
  /** The server answered an open with something that isn't a file. */
  failed: "Something went wrong.",
  open: (name: string) => `Open ${name}`,
  viewer: (name: string) => `Screenshot ${name}`,
  close: "Close",
} as const;

/** An evidence file read from the socket; anything malformed is one that can't be opened. */
export function normalizeEvidenceFile(raw: unknown): EvidenceFile {
  const r = isRecord(raw) ? raw : {};
  if (r.ok === false && isOneOf(PROBLEMS, r.problem)) return { ok: false, problem: r.problem };
  const name = typeof r.name === "string" && r.name ? r.name : null;
  if (r.ok !== true || name === null) return { ok: false, problem: "unreadable" };
  if (r.kind === "file") return { ok: true, kind: "file", name };
  const mime = typeof r.mime === "string" ? r.mime : "";
  if (r.kind === "image" && Object.values(IMAGE_TYPES).includes(mime) && typeof r.data === "string" && r.data) {
    return { ok: true, kind: "image", name, mime, data: r.data };
  }
  return { ok: false, problem: "unreadable" };
}

const text = (v: unknown): v is string => typeof v === "string" && v !== "";

/** The `{ dir, id, path }` params of `evidence.read` and `evidence.open`, or null. */
export function evidenceParams(params: unknown): { dir: string; id: string; path: string } | null {
  if (!isRecord(params)) return null;
  const { dir, id, path } = params;
  return text(dir) && text(id) && text(path) ? { dir, id, path } : null;
}
