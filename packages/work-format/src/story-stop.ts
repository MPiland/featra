/**
 * Stopping and resuming a story's agent (STORY-53, ADR 0026): pure rules over the card. Stopped is not a field: it is
 * what the card's history says last about it, so the one fact lives in one place and the history event is the mark.
 * Stop keeps the story's stage, and Resume clears the mark; neither touches the worktree.
 */
import { appendHistory } from "./history.ts";
import type { Card } from "./types.ts";

/** The `to` of the history event that marks a story stopped; Resume's event goes from it to null. */
export const STOPPED = "stopped";

/** Whether the card's last `stopped` event marked it stopped. */
export function isStopped(card: Pick<Card, "history">): boolean {
  return card.history.findLast((e) => e.field === "stopped")?.to === STOPPED;
}

export const STOP_MESSAGES = {
  gone: "That card is gone.",
  notStory: (id: string) => `${id} isn't a story.`,
  noAgent: (id: string) => `${id} has no agent to stop.`,
  stopped: (id: string) => `${id} is already stopped.`,
  notStopped: (id: string) => `${id} isn't stopped.`,
  idle: (id: string) => `${id} isn't running.`,
} as const;

/** Why `card` can't be stopped, or null when it can. An agent that isn't running is checked by the caller. */
export function stopRefusal(card: Card | undefined): string | null {
  if (!card) return STOP_MESSAGES.gone;
  if (card.type !== "story") return STOP_MESSAGES.notStory(card.id);
  if (card.agent === null || card.sessions.length === 0) return STOP_MESSAGES.noAgent(card.id);
  if (isStopped(card)) return STOP_MESSAGES.stopped(card.id);
  return null;
}

/** Why `card` can't be resumed, or null when it can. */
export function resumeRefusal(card: Card | undefined): string | null {
  if (!card) return STOP_MESSAGES.gone;
  if (card.type !== "story") return STOP_MESSAGES.notStory(card.id);
  return isStopped(card) ? null : STOP_MESSAGES.notStopped(card.id);
}

/** The card marked Stopped, with the history event; its stage and everything else are as they were. */
export function stoppedStory(card: Card, by: string, at: string): Card {
  return isStopped(card) ? card : appendHistory(card, { at, field: "stopped", from: null, to: STOPPED, by });
}

/** The card with Stopped cleared, with the history event. */
export function resumedStory(card: Card, by: string, at: string): Card {
  return isStopped(card) ? appendHistory(card, { at, field: "stopped", from: STOPPED, to: null, by }) : card;
}

/** What the agent is told when its story is resumed: it goes on in the same session. */
export const RESUME_MESSAGE = "Continue from where you stopped.";
