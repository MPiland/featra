/**
 * A restored chat's transcript, read from Claude's own session file (STORY-44, ADR 0018). The SDK's reader parses
 * the file, so Featra never depends on its format or location; reading it runs no agent and spends no tokens. Its
 * messages are the agent's own, so they are read as `unknown` and turned into chat events with the same translator
 * as the live stream.
 */
import { isRecord, type ChatEvent } from "@featra/work-format";
import { createClaudeTranslator, type ClaudeTranslator } from "./claude-messages.ts";

/** The SDK's session reader, narrowed to what Featra asks of it. Tests use the real one on a folder of their own. */
export interface SessionReader {
  /** The session's metadata, or undefined when Claude no longer has it. */
  info: (session: string, dir: string) => Promise<unknown>;
  /** The session's user and assistant messages, oldest first. */
  messages: (session: string, dir: string) => Promise<unknown[]>;
}

const DONE: ChatEvent = { type: "turn-end", outcome: "done" };

/** A turn's end: the context it used, when its messages said, then the end itself. */
const turnEnd = (translator: ClaudeTranslator): ChatEvent[] => {
  const usage = translator.turnUsage();
  return usage ? [usage, DONE] : [DONE];
};

/** What the user typed, when a user message is a prompt: text, not the tool results the agent is handed. */
function promptText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content) || content.length === 0) return null;
  const blocks = content.filter(isRecord);
  if (blocks.length !== content.length || !blocks.every((b) => b.type === "text")) return null;
  return blocks.map((b) => (typeof b.text === "string" ? b.text : "")).join("\n");
}

/**
 * A session's messages as chat events: each prompt starts a turn, and each turn ended before the next one began. A
 * subagent's own messages stay out, as they do live.
 */
export function transcriptEvents(messages: readonly unknown[]): ChatEvent[] {
  const translator = createClaudeTranslator();
  const events: ChatEvent[] = [];
  let open = false;
  for (const message of messages) {
    if (!isRecord(message) || (message.parent_tool_use_id ?? null) !== null) continue;
    const prompt = message.type === "user" && isRecord(message.message) ? promptText(message.message.content) : null;
    if (prompt === null) {
      events.push(...translator.translate(message));
      continue;
    }
    if (open) events.push(...turnEnd(translator));
    events.push({ type: "user", text: prompt });
    open = true;
  }
  if (open) events.push(...turnEnd(translator));
  return events;
}

/** The session's transcript, or null when Claude no longer has its session file. */
export async function claudeHistory(reader: SessionReader, session: string, dir: string): Promise<ChatEvent[] | null> {
  if ((await reader.info(session, dir)) === undefined) return null;
  return transcriptEvents(await reader.messages(session, dir));
}
