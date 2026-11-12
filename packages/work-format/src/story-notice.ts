/**
 * Story agents report to the Dev Lead (STORY-54, ADR 0028): the notices Featra writes into the Dev Lead's chat when a
 * story session's turn ends, stops or fails, or the session asks a question, and the rules for the Dev Lead's reply
 * (`message_session`). Pure and provider neutral: the app writes every notice, so none costs a model call.
 */
import type { ChatEvent, TurnOutcome } from "./chat-events.ts";
import { parseId } from "./ids.ts";
import type { Answers, Question } from "./questions.ts";
import { isMerged } from "./history.ts";
import { stoppedIn } from "./story-stop.ts";
import type { Card } from "./types.ts";
import { isRecord } from "./utils/guards.ts";
import type { Tone } from "./work-list-types.ts";

/**
 * What a notice says happened: the turn ended, the user stopped it, it failed, or the session asks the Dev Lead; or,
 * of a merge the Dev Lead asked for (STORY-12), it merged, the user declined it, or it didn't merge.
 */
export type NoticeOutcome = "ended" | "stopped" | "failed" | "asks" | "merged" | "merge declined" | "not merged";

export interface Notice {
  story: string;
  outcome: NoticeOutcome;
  /** One line: the last of what the session said, or its question. Empty when there was nothing to say. */
  summary: string;
}

/** The label that opens every notice, so the Dev Lead can tell the app from the user. */
export const NOTICE_LABEL = "[Featra notice, written by the app, not the user]";
/** What follows a notice that holds a question. */
export const NOTICE_ASKS_HINT = "Answer a story's question with message_session, or ask the user yourself.";
/** What a message from the Dev Lead starts with in the story session's chat. */
export const LEAD_LABEL = "Message from the Dev Lead:";
/** The longest summary a notice carries. */
export const NOTICE_SUMMARY_MAX = 160;
/** The longest a notice that holds questions is: they carry the options, so the Dev Lead can answer from the notice. */
export const ASKS_SUMMARY_MAX = 600;

/** What the session is told when its question went to the Dev Lead (its tool call is refused, so its turn ends). */
export const ASKED_LEAD =
  "Your question went to the Dev Lead, who will answer you here. End your turn now and wait for its message.";

export const MESSAGE_MESSAGES = {
  badStory: "Give the story's id, such as STORY-9, as `story`.",
  badText: "Give the message as `text`.",
  gone: "That card is gone.",
  notStory: (id: string) => `${id} isn't a story.`,
  noSession: (id: string) => `${id} has no session to message.`,
  notLead: (id: string) => `Only the Dev Lead that started ${id} can message it.`,
  stopped: (id: string) => `${id} is stopped. Only the user can resume it.`,
  working: (id: string) => `${id} is working. Its next notice says when it can be messaged.`,
  queued: (id: string) => `${id} is waiting for a slot. Its next notice says when it can be messaged.`,
  merged: (id: string) => `${id} is merged. Its session is history now.`,
  sent: (id: string) => `Sent to ${id}. Its next notice tells you what it did.`,
} as const;

/** A `message_session` call: the story and what to tell its session. */
export interface MessageInput {
  story: string;
  text: string;
}

export function parseMessageInput(input: unknown): { ok: true; value: MessageInput } | { ok: false; error: string } {
  const raw = isRecord(input) ? input : {};
  const story = (typeof raw.story === "string" ? raw.story.trim() : "").toUpperCase();
  if (parseId(story)?.prefix !== "STORY") return { ok: false, error: MESSAGE_MESSAGES.badStory };
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (text === "") return { ok: false, error: MESSAGE_MESSAGES.badText };
  return { ok: true, value: { story, text } };
}

/** What the story session hears from the Dev Lead. */
export const leadMessage = (text: string): string => `${LEAD_LABEL}\n\n${text}`;

/** The session as its row says it: what decides whether a message can go to it now. */
export interface SessionState {
  running: boolean;
  queued: boolean;
  /** The chat that started it (the Dev Lead). */
  lead: string | null;
}

/**
 * Why the Dev Lead `lead` can't message `id`'s session now, or null when it can. Stopped is the user's: a message
 * never clears it, only Resume does.
 */
export function messageRefusal(
  card: Card | undefined,
  tone: Tone,
  id: string,
  session: SessionState | null,
  lead: string,
): string | null {
  if (!card) return MESSAGE_MESSAGES.gone;
  if (card.type !== "story") return MESSAGE_MESSAGES.notStory(id);
  if (isMerged(card)) return MESSAGE_MESSAGES.merged(id);
  if (session === null) return MESSAGE_MESSAGES.noSession(id);
  if (session.lead !== lead) return MESSAGE_MESSAGES.notLead(id);
  if (stoppedIn(card, tone)) return MESSAGE_MESSAGES.stopped(id);
  if (session.running) return MESSAGE_MESSAGES.working(id);
  return session.queued ? MESSAGE_MESSAGES.queued(id) : null;
}

/** `text` on one line, cut at `max` characters. */
export function oneLine(text: string, max = NOTICE_SUMMARY_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** The last reply block of the turn `events` ends with: what the agent said last, before the user's next message. */
export function lastMessage(events: readonly ChatEvent[]): string {
  const turn: string[] = [];
  let block: string | null = null;
  for (const e of events.toReversed()) {
    if (e.type === "user") break;
    if (e.type !== "text") continue;
    block ??= e.block;
    if (e.block === block) turn.unshift(e.delta);
  }
  return oneLine(turn.join(""));
}

/** What a notice says of a turn that ended `outcome`: why it failed, when it did and said, else its last message. */
export function turnSummary(events: readonly ChatEvent[], outcome: TurnOutcome): string {
  if (outcome === "failed") {
    for (const e of events.toReversed()) {
      if (e.type === "user") break;
      if (e.type === "problem" && e.problem.type === "failed") return oneLine(e.problem.message);
    }
  }
  return lastMessage(events);
}

/** The questions as one line: each question's text with its option labels. */
export const questionSummary = (questions: readonly Question[]): string =>
  questions
    .map((q) => (q.options.length > 0 ? `${q.question} (${q.options.map((o) => o.label).join(" / ")})` : q.question))
    .join("; ");

/** Every question a turn asked, as the one bounded line of an "asks" notice. */
export const askedSummary = (
  asked: readonly (readonly Question[])[],
  /** The subagent that asked each one, when one did (STORY-55): the line says so. */
  by: readonly (string | undefined)[] = [],
): string =>
  oneLine(
    asked.map((qs, i) => (by[i] ? `Asked by the subagent ${by[i]}: ` : "") + questionSummary(qs)).join(" | "),
    ASKS_SUMMARY_MAX,
  );

/** What a story session hears when the user answered the question that went to a Dev Lead that was gone. */
export function userAnswerMessage(answers: Answers): string {
  const lines = Object.entries(answers).map(([question, chosen]) => `- ${question} ${chosen.join(", ")}`);
  return ["The user answered your question:", ...lines].join("\n");
}

/** The notice outcome for how a turn ended. */
export const outcomeOf = (turn: TurnOutcome): NoticeOutcome => (turn === "done" ? "ended" : turn);

/** One notice as a line. */
export const noticeLine = ({ story, outcome, summary }: Notice): string =>
  summary === "" ? `${story} ${outcome}.` : `${story} ${outcome}: ${summary}`;

/** The message that puts `notices` in the Dev Lead's chat: one message however many there are. */
export function noticeMessage(notices: readonly Notice[]): string {
  const lines = notices.map((n) => `- ${noticeLine(n)}`);
  const hint = notices.some((n) => n.outcome === "asks") ? [NOTICE_ASKS_HINT] : [];
  return [NOTICE_LABEL, ...lines, ...hint].join("\n");
}
