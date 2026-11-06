import { NEW_CONFIG } from "./config.ts";

/**
 * What Featra init puts in a project: the work folder and the project-knowledge files agents read and propose edits
 * to. Paths are relative to the project folder and use "/". Init only ever creates what is missing; a file or folder
 * that is there is kept as it is.
 */
export type ScaffoldEntry =
  | { kind: "file"; path: string; content: string }
  /** A folder; `seed` files are written only when init creates the folder itself, never into the user's own. */
  | { kind: "folder"; path: string; seed: { name: string; content: string }[] };

/** The user's own agent instruction files. Featra never creates or edits them on its own (CONTEXT.md). */
export const AGENT_INSTRUCTION_FILES: readonly string[] = ["CLAUDE.md", "AGENTS.md"];

const CONTEXT = `# Domain language

The terms used across this project's code, cards and docs. Keep each definition short and link ADRs for the reasoning.
`;

const DECISIONS = `# Decisions

Smaller decisions, newest last: one dated entry each, saying what was decided and why. Architecturally significant
decisions get an ADR in \`docs/adr/\` instead.
`;

const OPEN_QUESTIONS = `# Open questions

Questions that still need an answer, with who can answer them. Move each to \`decisions.md\` once it is settled.
`;

const ADR_README = `# Architecture decision records

One file per decision that is hard to reverse or that a future contributor would question, numbered in order
(\`0001-short-title.md\`), each with Context, Decision and Consequences. Never edit an accepted ADR's decision: write a
new ADR that supersedes it.
`;

export const FEATRA_SCAFFOLD: readonly ScaffoldEntry[] = [
  { kind: "file", path: ".featra/config.yaml", content: NEW_CONFIG },
  { kind: "file", path: "CONTEXT.md", content: CONTEXT },
  { kind: "folder", path: "docs/adr", seed: [{ name: "README.md", content: ADR_README }] },
  { kind: "file", path: "decisions.md", content: DECISIONS },
  { kind: "file", path: "open-questions.md", content: OPEN_QUESTIONS },
];

/** The folder that marks a project as set up for Featra. */
export const FEATRA_DIR = ".featra";

/** Whether `path` (relative, "/" separated) names an agent instruction file, in any folder and any case. */
export function isAgentInstructionFile(path: string): boolean {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  return AGENT_INSTRUCTION_FILES.some((f) => f.toLowerCase() === name);
}
