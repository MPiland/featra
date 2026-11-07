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
import { errorMessage } from "@featra/work-format/guards";
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
}

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
  pr: "PR",
  owner: (owner: string) => `Saved to ${owner}`,
  edit: (label: string) => `Edit ${label.toLowerCase()}`,
  now: (value: string) => `Now: ${value || "empty"}`,
  none: "None",
  evidence: "Evidence",
  marks: { reported: "Reported", verified: "Verified", proven: "Proven", accepted: "Accepted" },
  proof: { passed: "Test passed", linked: "Test not passed yet", none: "No test yet" } satisfies Record<
    AcProof,
    string
  >,
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
  };
}
