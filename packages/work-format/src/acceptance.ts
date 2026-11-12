/**
 * Accepting a story or sending it back (STORY-23): pure rules over the card. A story waits in Acceptance for the user.
 * Accept records the user's sign-off and, when the evidence allows, moves the story to Done; Send back returns it to
 * In Progress with the user's reason, which can also become a new acceptance criterion. Accepted is a fact in the
 * card's history (`accepted`), never a stage, so a story accepted before its CI has passed stays in Acceptance until
 * Verified arrives, and `settleDone` is what moves it then.
 */
import { recorded } from "./card-edit.ts";
import { isKnownStatus, stageCategory } from "./config.ts";
import { checkTransition, evidenceState } from "./evidence.ts";
import { recordAcceptance, recordSentBack, SEND_BACK_MAX, setStatus } from "./history.ts";
import { IN_PROGRESS } from "./story-start.ts";
import { resumedStory } from "./story-stop.ts";
import type { Card, ProjectConfig } from "./types.ts";

/** The stage a story waits in for the user's Accept. */
export const ACCEPTANCE = "Acceptance";

export const ACCEPT_MESSAGES = {
  gone: "That card is gone.",
  notStory: (id: string) => `${id} isn't a story.`,
  notWaiting: (id: string, status: string) => `${id} is ${status}, not ${ACCEPTANCE}.`,
  accepted: (id: string) => `${id} is already accepted.`,
  noReason: "Say why you're sending it back.",
  tooLong: `Keep it under ${SEND_BACK_MAX.toLocaleString("en-US")} characters.`,
  noSession: (id: string) => `The session of ${id} is gone.`,
  readOnly: "Can't edit it here.",
} as const;

/** Whether Accept and Send back apply: a story in Acceptance that the user hasn't accepted. */
export function awaitingAcceptance(card: Card, config: ProjectConfig): boolean {
  return (
    card.type === "story" &&
    card.status === ACCEPTANCE &&
    isKnownStatus(ACCEPTANCE, config) &&
    !evidenceState(card).accepted
  );
}

/** Why Accept and Send back can't be used on `card`, or null when they can. */
export function acceptanceRefusal(card: Card | undefined, id: string, config: ProjectConfig): string | null {
  if (!card) return ACCEPT_MESSAGES.gone;
  if (card.type !== "story") return ACCEPT_MESSAGES.notStory(id);
  if (evidenceState(card).accepted) return ACCEPT_MESSAGES.accepted(id);
  if (!awaitingAcceptance(card, config)) return ACCEPT_MESSAGES.notWaiting(id, card.status);
  return null;
}

/** The first stage whose category is done: where an accepted, verified story goes. */
export const doneStage = (config: ProjectConfig): string | null =>
  config.stages.find((s) => s.category === "done")?.name ?? null;

/**
 * The story moved to Done by `by` when it is waiting in Acceptance, the user has accepted it and nothing else is
 * missing (Verified, for a story with a PR; a Researcher story needs Accept only). Otherwise the card as it was.
 * Whatever writes Verified later calls this too, so an accepted story moves the moment its CI passes.
 */
export function settleDone(card: Card, config: ProjectConfig, by: string, at: string): Card {
  const done = doneStage(config);
  if (done === null || card.type !== "story" || card.status !== ACCEPTANCE) return card;
  if (!evidenceState(card).accepted || stageCategory(done, config) !== "done") return card;
  return checkTransition(card, done, config).ok ? setStatus(card, done, by, at) : card;
}

/** The card with the user's Accept recorded (once) and, if it is ready, moved to Done. */
export function acceptedStory(card: Card, config: ProjectConfig, by: string, at: string): Card {
  return settleDone(recordAcceptance(card, true, by, at), config, by, at);
}

/** A reason as one line, which is how it reads as a criterion. */
export const reasonAsCriterion = (reason: string): string => reason.replace(/\s+/g, " ").trim();

/**
 * The card as sent back: the reason in its history, the story In Progress again, a stopped mark cleared (the user is
 * directing the session), and with `addCriterion` the reason as a new, unchecked acceptance criterion.
 */
export function sentBackStory(card: Card, reason: string, addCriterion: boolean, by: string, at: string): Card {
  let next = setStatus(recordSentBack(resumedStory(card, by, at), reason, by, at), IN_PROGRESS, by, at);
  if (!addCriterion) return next;
  const acs = [...next.acs, { text: reasonAsCriterion(reason), done: false, test: null }];
  return recorded(next, { ...next, acs }, "ac", by, at);
}
