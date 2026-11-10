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
}

/** Why a send-back didn't go, or that it did; `recorded` is false when the chat has it but history doesn't. */
export type SendBackResult = { ok: true; recorded: boolean } | { ok: false; error: string };

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
  sendBackGone: "Its chat is gone.",
  sendBackUnrecorded: "Sent. Couldn't record it in history.",
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
    sendBack: (dir, id, reason) =>
      server.call("draft.sendBack", { dir, id, reason }).then(
        (r): SendBackResult => ({ ok: true, recorded: !(isRecord(r) && r.recorded === false) }),
        (err: unknown): SendBackResult => ({ ok: false, error: errorMessage(err) }),
      ),
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
  };
}
