/** A Markdown file with YAML frontmatter, as Featra's role files and Claude's agent files are written. Pure. */
import { parse, stringify } from "yaml";
import { errorMessage, isRecord } from "./utils/guards.ts";

export interface Frontmatter {
  /** The frontmatter's keys; empty when the file has none. */
  data: Record<string, unknown>;
  /** What follows the frontmatter, trimmed. */
  body: string;
  /** True when the file opened with a frontmatter block. */
  has: boolean;
}

/** The file's frontmatter and body, or why its frontmatter can't be read. */
export function splitFrontmatter(text: string): Frontmatter | { error: string } {
  const normalized = text.replace(/\r\n/g, "\n").replace(/^﻿/, "");
  const match = /^---\n([\s\S]*?)\n?---[ \t]*(?:\n([\s\S]*))?$/.exec(normalized);
  if (!match) return { data: {}, body: normalized.trim(), has: false };
  let data: unknown;
  try {
    data = parse(match[1] ?? "") ?? {};
  } catch (e) {
    return { error: `invalid frontmatter: ${errorMessage(e)}` };
  }
  if (!isRecord(data)) return { error: "frontmatter must be a mapping" };
  return { data, body: (match[2] ?? "").trim(), has: true };
}

/** A file's text: `data` as frontmatter, then `body`. */
export function joinFrontmatter(data: Record<string, unknown>, body: string): string {
  return `---\n${stringify(data, { lineWidth: 0 })}---\n\n${body.trim()}\n`;
}
