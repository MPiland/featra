/**
 * The card pane's bridge and wording (ADR 0017): one card, live from its owner copy, and one-field edits saved to
 * that copy by the local server.
 */
import {
  normalizeCardUpdateResult,
  normalizeCardView,
  type AcProof,
  type CardEdit,
  type CardUpdateResult,
  type CardView,
} from "@featra/work-format/card-view";
import { errorMessage, isRecord } from "@featra/work-format/guards";
import type { ServerClient } from "./server-client.ts";

export type { CardEdit, CardUpdateResult, CardView };

/** What a card watch hears: the card now (null when it's gone or not yet read), and why it's out of date. */
export interface CardUpdate {
  view: CardView | null;
  loading: boolean;
  error: string | null;
}

export interface CardBridge {
  /** Calls back with the card now and on every change; returns the stop. */
  watchCard: (dir: string, id: string, listener: (update: CardUpdate) => void) => () => void;
  /** Saves one edit to the card's owner copy; answers with the card as it is after, or why not. */
  updateCard: (dir: string, id: string, edit: CardEdit) => Promise<CardUpdateResult>;
  /** Sends a draft feature back to its chat with the reason (STORY-50). */
  sendBack: (dir: string, id: string, reason: string) => Promise<SendBackResult>;
  /** Approves a draft feature: the server commits its cards to main (STORY-51). */
  approve: (dir: string, id: string) => Promise<ReviewResult>;
  /** Rejects a draft feature: the server deletes its cards (STORY-51). */
  reject: (dir: string, id: string) => Promise<ReviewResult>;
  /** Starts an approved feature: the server makes its branch and the feature is active there (STORY-52). */
  start: (dir: string, id: string) => Promise<ReviewResult>;
  /** Starts a story's agent in its own worktree; it is queued when the project is at its limit of story agents (STORY-9). */
  startStory: (dir: string, id: string) => Promise<StartStoryResult>;
  /** Accepts a story waiting in Acceptance: Accepted in its history, and Done when its evidence allows (STORY-23). */
  acceptStory: (dir: string, id: string) => Promise<ReviewResult>;
  /** Sends a story in Acceptance back to its session with the reason, optionally as a new criterion (STORY-23). */
  sendBackStory: (dir: string, id: string, reason: string, addCriterion: boolean) => Promise<SendBackResult>;
  /** Stops the story's running turn and marks it Stopped; its stage and worktree stay (STORY-53). */
  stopStory: (dir: string, id: string) => Promise<ReviewResult>;
  /** Goes on in the stopped story's session, and clears Stopped (STORY-53). */
  resumeStory: (dir: string, id: string) => Promise<ReviewResult>;
}

/** The chat the story's agent runs in, and whether it waits for a free slot; or why it didn't start. */
export type StartStoryResult = { ok: true; chat: string; queued: boolean } | { ok: false; error: string };

/** Whether Approve or Reject went through, or why not. */
export type ReviewResult = { ok: true } | { ok: false; error: string };

/** Why a send-back didn't go, or that it did; `recorded` is false when the chat has it but history doesn't. */
export type SendBackResult = { ok: true; recorded: boolean } | { ok: false; error: string };

/** What Accept and Send back call: the story's id. */
export interface AcceptActions {
  accept: (id: string) => Promise<ReviewResult>;
  sendBack: (id: string, reason: string, addCriterion: boolean) => Promise<SendBackResult>;
}

const sent = (r: unknown): SendBackResult => ({ ok: true, recorded: !(isRecord(r) && r.recorded === false) });
const refused = (err: unknown): SendBackResult => ({ ok: false, error: errorMessage(err) });

export const CARD_COPY = {
  close: "Close card",
  resize: "Resize card pane",
  pane: (id: string) => `${id} card`,
  loading: "Loading…",
  gone: "This card isn't in the project any more.",
  status: "Status",
  parent: "Parent",
  title: "Title",
  story: "User story",
  storyEmpty: "Add the user story",
  notes: "Notes",
  notesEmpty: "Add notes",
  acs: "Acceptance criteria",
  tasks: "Tasks",
  stories: "Stories",
  backTo: (id: string) => `Back to ${id}`,
  sendBack: "Send back…",
  sendBackForm: "Send back",
  sendBackReason: "Reason",
  sendBackHint: "What should change?",
  sendBackSend: "Send",
  sendBackCancel: "Cancel",
  sendBackCriterion: "Add as acceptance criterion",
  accept: "Accept",
  acceptOf: (id: string) => `Accept ${id}`,
  sendBackOf: (id: string) => `Send back ${id}`,
  sendBackGone: "Its chat is gone.",
  sendBackUnrecorded: "Sent. Couldn't record it in history.",
  approve: "Approve",
  reject: "Reject",
  start: "Start",
  rejectAsk: (id: string, stories: number) => `Delete ${id} and its ${stories} ${stories === 1 ? "story" : "stories"}?`,
  rejectConfirm: "Delete",
  rejectCancel: "Cancel",
  pr: "PR",
  owner: (owner: string) => `Saved to ${owner}`,
  edit: (label: string) => `Edit ${label.toLowerCase()}`,
  now: (value: string) => `Now: ${value || "empty"}`,
  none: "None",
  evidence: "Evidence",
  marks: { reported: "Reported", verified: "Verified", proven: "Proven", accepted: "Accepted" },
  proof: { passed: "Test passed", linked: "No result yet", none: "No test yet" } satisfies Record<AcProof, string>,
  count: (done: number, total: number, what: string) => `${done} of ${total} ${what}`,
} as const;

const review = (call: Promise<unknown>): Promise<ReviewResult> =>
  call.then(
    (): ReviewResult => ({ ok: true }),
    (err: unknown): ReviewResult => ({ ok: false, error: errorMessage(err) }),
  );

/** The pane's bridge over the server client. */
export function serverCards(server: ServerClient): CardBridge {
  return {
    watchCard(dir, id, listener) {
      let last: CardView | null = null;
      return server.watch(
        "card.watch",
        { dir, id },
        {
          data: (raw) => {
            last = normalizeCardView(raw);
            listener({ view: last, loading: false, error: null });
          },
          error: (message) => listener({ view: last, loading: false, error: message }),
        },
      );
    },
    updateCard: (dir, id, edit) =>
      server.call("card.update", { dir, id, edit }).then(normalizeCardUpdateResult, (err: unknown) => ({
        ok: false,
        error: errorMessage(err),
        view: null,
      })),
    sendBack: (dir, id, reason) => server.call("draft.sendBack", { dir, id, reason }).then(sent, refused),
    acceptStory: (dir, id) => review(server.call("story.accept", { dir, id })),
    sendBackStory: (dir, id, reason, addCriterion) =>
      server.call("story.sendBack", { dir, id, reason, addCriterion }).then(sent, refused),
    approve: (dir, id) => review(server.call("draft.approve", { dir, id })),
    reject: (dir, id) => review(server.call("draft.reject", { dir, id })),
    start: (dir, id) => review(server.call("feature.start", { dir, id })),
    startStory: (dir, id) =>
      server.call("story.start", { dir, id }).then(
        (r): StartStoryResult =>
          isRecord(r) && typeof r.chat === "string"
            ? { ok: true, chat: r.chat, queued: r.queued === true }
            : { ok: false, error: errorMessage(new Error("Featra gave an unexpected answer.")) },
        (err: unknown): StartStoryResult => ({ ok: false, error: errorMessage(err) }),
      ),
    stopStory: (dir, id) => review(server.call("story.stop", { dir, id })),
    resumeStory: (dir, id) => review(server.call("story.resume", { dir, id })),
  };
}

/** A browser tab has no folders, so no cards. */
export function noCards(error: string): CardBridge {
  return {
    watchCard(_dir, _id, listener) {
      listener({ view: null, loading: false, error });
      return () => {};
    },
    updateCard: async () => ({ ok: false, error, view: null }),
    sendBack: async () => ({ ok: false, error }),
    acceptStory: async () => ({ ok: false, error }),
    sendBackStory: async () => ({ ok: false, error }),
    approve: async () => ({ ok: false, error }),
    reject: async () => ({ ok: false, error }),
    start: async () => ({ ok: false, error }),
    startStory: async () => ({ ok: false, error }),
    stopStory: async () => ({ ok: false, error }),
    resumeStory: async () => ({ ok: false, error }),
  };
}
