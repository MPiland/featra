/** The short summary a collapsed tool row shows beside the tool's name: the one input that says what it did. */
import { isRecord } from "./utils/guards.ts";

/** Longer summaries are cut here, with an ellipsis, so a row stays one line. */
export const SUMMARY_MAX = 80;

/** The input field that best says what each well-known tool did. */
const KEY_FIELD: Readonly<Record<string, string>> = {
  Bash: "command",
  Read: "file_path",
  Write: "file_path",
  Edit: "file_path",
  MultiEdit: "file_path",
  NotebookEdit: "notebook_path",
  Glob: "pattern",
  Grep: "pattern",
  WebFetch: "url",
  WebSearch: "query",
  Task: "description",
  Agent: "description",
  Skill: "skill",
};

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

function cut(text: string): string {
  const line = oneLine(text);
  return line.length > SUMMARY_MAX ? `${line.slice(0, SUMMARY_MAX - 1)}…` : line;
}

/** The tool's key input, or else its first text input; empty when it has none. */
export function toolSummary(name: string, input: unknown): string {
  if (!isRecord(input)) return "";
  const key = KEY_FIELD[name];
  const value = key === undefined ? undefined : input[key];
  if (typeof value === "string" && value.trim()) return cut(value);
  const first = Object.values(input).find((v): v is string => typeof v === "string" && v.trim() !== "");
  return first === undefined ? "" : cut(first);
}
