/**
 * The agent definitions the providers keep, read as roles (STORY-6): Claude's `.claude/agents/<name>.md` (YAML
 * frontmatter, the prompt as the body) and Codex's `.codex/agents/<name>.toml` (`developer_instructions`). Pure: one
 * parser per provider, and the server's readers fetch the files. The model is kept as the file says it; the registry
 * fits it to the agent that runs the chat.
 */
import { parse as parseToml } from "smol-toml";
import { splitFrontmatter } from "./frontmatter.ts";
import { EFFORTS, type Effort } from "./roles.ts";
import { errorMessage, isOneOf } from "./utils/guards.ts";

/** What an agent file defines: a role without its id, source or mode, which the reader adds. */
export interface AgentDef {
  name: string;
  description?: string;
  prompt: string;
  /** As the file says it; absent when it names none. */
  model?: string;
  effort: Effort;
}

export type AgentRead = { ok: true; agent: AgentDef } | { ok: false; error: string };

/** What an agent file that names no effort starts with. */
export const AGENT_EFFORT: Effort = "medium";

const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** A Claude agent file; `stem` (its file name without `.md`) names it when its frontmatter doesn't. */
export function parseClaudeAgent(content: string, stem: string): AgentRead {
  const file = splitFrontmatter(content);
  if ("error" in file) return { ok: false, error: file.error };
  if (!file.has) return { ok: false, error: "no frontmatter" };
  const { name, description, model, effort } = file.data;
  const desc = text(description);
  const m = text(model);
  return {
    ok: true,
    agent: {
      name: text(name) ?? stem,
      ...(desc ? { description: desc } : {}),
      prompt: file.body,
      ...(m ? { model: m } : {}),
      effort: isOneOf(EFFORTS, effort) ? effort : AGENT_EFFORT,
    },
  };
}

/** Codex's reasoning efforts, as Featra's: `minimal` is its lowest, `low`. */
const CODEX_EFFORTS = new Map<string, Effort>([
  ["minimal", "low"],
  ["low", "low"],
  ["medium", "medium"],
  ["high", "high"],
  ["xhigh", "xhigh"],
]);

/** A Codex agent file; `stem` names it when it doesn't. */
export function parseCodexAgent(content: string, stem: string): AgentRead {
  let table: Record<string, unknown>;
  try {
    table = parseToml(content);
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  const desc = text(table.description);
  const m = text(table.model);
  const effort = text(table.model_reasoning_effort);
  return {
    ok: true,
    agent: {
      name: text(table.name) ?? stem,
      ...(desc ? { description: desc } : {}),
      prompt: text(table.developer_instructions) ?? "",
      ...(m ? { model: m } : {}),
      effort: (effort && CODEX_EFFORTS.get(effort)) || AGENT_EFFORT,
    },
  };
}
