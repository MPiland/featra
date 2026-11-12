/**
 * Stopping and resuming a story's agent (STORY-53, ADR 0026): pure rules over the card. Stopped is not a field: it is
 * what the card's history says last about it, so the one fact lives in one place and the history event is the mark.
 * Stop keeps the story's stage, and Resume clears the mark; neither touches the worktree.
 */
import { appendHistory, isMerged } from "./history.ts";
import type { Card } from "./types.ts";
import type { Tone } from "./work-list-types.ts";

/** The `to` of the history event that marks a story stopped; Resume's event goes from it to null. */
export const STOPPED = "stopped";

/** Whether the card's last `stopped` event marked it stopped. */
export function isStopped(card: Pick<Card, "history">): boolean {
  return card.history.findLast((e) => e.field === "stopped")?.to === STOPPED;
}

/**
 * Whether the story is stopped as far as anything shows or acts on it: its last `stopped` event marks it, and its stage
 * is not a finished one. Stopped does not outlive the session: a Done or Cancelled story is not stopped any more.
 */
export const stoppedIn = (card: Pick<Card, "history">, tone: Tone): boolean =>
  isStopped(card) && tone !== "done" && tone !== "cancelled";

export const STOP_MESSAGES = {
  gone: "That card is gone.",
  notStory: (id: string) => `${id} isn't a story.`,
  noAgent: (id: string) => `${id} has no agent to stop.`,
  stopped: (id: string) => `${id} is already stopped.`,
  notStopped: (id: string) => `${id} isn't stopped.`,
  idle: (id: string) => `${id} isn't running.`,
  running: (id: string) => `${id} is running.`,
  queued: (id: string) => `${id} is waiting for a slot.`,
  merged: (id: string) => `${id} is merged. Its session is history now.`,
} as const;

/** What a session's story-agent row says of it, for the rules on Stop and Resume. */
export interface StoryTurn {
  running: boolean;
  queued: boolean;
  /** The last turn ended with no way for the user to go on (`ChatSummary.stalled`). */
  stalled: boolean;
}

/** The ways to go on after a session that is idle: Resume is offered on a Stopped story, or a stalled one In Progress. */
export const canResume = (stopped: boolean, stalled: boolean, tone: Tone): boolean =>
  stopped || (stalled && tone === "active");

/** Why `card` can't be stopped, or null when it can. An agent that isn't running is checked by the caller. */
export function stopRefusal(card: Card | undefined, tone: Tone): string | null {
  if (!card) return STOP_MESSAGES.gone;
  if (card.type !== "story") return STOP_MESSAGES.notStory(card.id);
  if (card.agent === null || card.sessions.length === 0) return STOP_MESSAGES.noAgent(card.id);
  if (stoppedIn(card, tone)) return STOP_MESSAGES.stopped(card.id);
  return null;
}

/** Why `card`'s agent can't be resumed, or null when it can: it is Stopped, or stalled In Progress, and has no turn going. */
export function resumeRefusal(card: Card | undefined, tone: Tone, turn: StoryTurn): string | null {
  if (!card) return STOP_MESSAGES.gone;
  if (card.type !== "story") return STOP_MESSAGES.notStory(card.id);
  if (isMerged(card)) return STOP_MESSAGES.merged(card.id);
  if (!canResume(stoppedIn(card, tone), turn.stalled, tone)) return STOP_MESSAGES.notStopped(card.id);
  if (turn.running) return STOP_MESSAGES.running(card.id);
  return turn.queued ? STOP_MESSAGES.queued(card.id) : null;
}

/** The card marked Stopped, with the history event; its stage and everything else are as they were. */
export function stoppedStory(card: Card, by: string, at: string): Card {
  return isStopped(card) ? card : appendHistory(card, { at, field: "stopped", from: null, to: STOPPED, by });
}

/** The card with Stopped cleared, with the history event. */
export function resumedStory(card: Card, by: string, at: string): Card {
  return isStopped(card) ? appendHistory(card, { at, field: "stopped", from: STOPPED, to: null, by }) : card;
}

/** The history event of a story that left the queue because the user stopped it before its agent started. */
export function leftQueue(card: Card, by: string, at: string): Card {
  return appendHistory(card, { at, field: "queued", from: "queued", to: null, by });
}

/** What the agent is told when its story is resumed: it goes on in the same session. */
export const RESUME_MESSAGE = "Continue from where you stopped.";
