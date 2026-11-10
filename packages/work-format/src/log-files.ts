/**
 * Where entries are logged. Apart from the rest of knowledge-log so the window can name them without bundling the
 * scaffold (and its YAML parser).
 */

export type LogKind = "decision" | "question";

/** The file each kind is logged to, relative to the project folder. */
export const LOG_FILES = { decision: "decisions.md", question: "open-questions.md" } as const;
export type LogFile = (typeof LOG_FILES)[LogKind];
