/**
 * The design review of a story's screenshots (STORY-73, ADR 0045), wired: Featra's part is deterministic and costs no
 * model call. The Dev Lead that delegated the story reviews; Featra tells it the story waits (a notice naming the
 * screenshots), puts its findings in the story's session as a message from it, and shows where the review stands on
 * the card. When that Dev Lead chat is gone, the card says so and the user clears the review, or sends the story back.
 */
import {
  appendHistory,
  DESIGN_REVIEW_COPY,
  designReviewState,
  evidenceFolder,
  setStatus,
  stageCeiling,
  toIso,
  type Card,
  type CardView,
  type Notice,
  type ProjectConfig,
} from "@featra/work-format";
import { ownedIn, writeAtomic } from "./card-actions.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import { createCardMark } from "./card-mark.ts";
import type { ChatManager } from "./chat-manager.ts";
import { createStoryMessage } from "./story-message.ts";
import type { Scan } from "./work-scan.ts";

export const DESIGN_REVIEW_MESSAGES = {
  none: (id: string) => `${id} has no design review waiting.`,
  readOnly: "Can't edit it here.",
} as const;

export interface DesignReviewDeps {
  scan: (dir: string) => Promise<Scan | null>;
  now: () => Date;
  /** The lane every card write goes through; the server shares one. */
  lane?: CardLane;
  chats: Pick<ChatManager, "storySession" | "storyLead" | "list" | "open" | "send" | "notifyFrom">;
  /** Why the story takes no message now: it is merging or being abandoned. Null when it does. */
  busy?: (dir: string, id: string) => string | null;
  /** How a card reaches disk. Default: atomically. */
  write?: (file: string, text: string) => Promise<void>;
}

/** Why story `id`'s design review can't be cleared: none waits. */
const waits =
  (id: string) =>
  (card: Card | undefined, config: ProjectConfig): string | null => {
    const state = card ? designReviewState(card, config) : null;
    return state === null || state.status === "cleared" ? DESIGN_REVIEW_MESSAGES.none(id) : null;
  };

export function createDesignReviews({
  scan: scanDir,
  now,
  lane = createCardLane(),
  chats,
  busy,
  write = writeAtomic,
}: DesignReviewDeps) {
  const messages = createStoryMessage({ scan: scanDir, chats, busy });
  const marks = createCardMark({ scan: scanDir, write });

  /**
   * Whether no Dev Lead chat can review story `id`: its session has none its notices reach (gone, closed or unable to
   * run), the same test the "waits for design review" notice goes by.
   */
  function leadGone(dir: string, id: string): boolean {
    const chat = chats.storySession(dir, id);
    return chat === null || chats.storyLead(chat) === null;
  }

  return {
    /** Opens story `story`'s session for the findings of the Dev Lead `lead`; throws when it can't take them now. */
    ready: (dir: string, story: string, lead: string) => messages.ready(dir, story, lead),

    /** Puts the Dev Lead's `findings` in story `story`'s session, as a message from it. */
    deliver: (dir: string, story: string, lead: string, findings: string) =>
      messages.deliver(dir, story, lead, DESIGN_REVIEW_COPY.message(story, findings)),

    /** Tells the Dev Lead that story `id` waits for its design review, naming the screenshots, when it does. */
    async waiting(dir: string, id: string): Promise<void> {
      const scan = await scanDir(dir);
      const card = ownedIn(scan, id)?.owned.card;
      const chat = chats.storySession(dir, id);
      const state = card && scan ? designReviewState(card, scan.collected.config) : null;
      if (!card || state?.status !== "waiting" || chat === null) return;
      const folder = evidenceFolder(card) ?? "";
      const names = state.shots.map((s) => s.slice(folder.length));
      const notice: Notice = {
        story: id,
        outcome: "waits for design review",
        summary: DESIGN_REVIEW_COPY.notice(folder, names, state.fixed === true),
      };
      chats.notifyFrom(chat, notice);
    },

    /** Adds where story `view`'s design review stands to its card, and whether its Dev Lead chat is gone. */
    decorate(dir: string, scanned: Scan | null, view: CardView | null): CardView | null {
      const card = view?.type === "story" ? ownedIn(scanned, view.id)?.owned.card : undefined;
      const state = card && scanned ? designReviewState(card, scanned.collected.config) : null;
      if (!view || !state) return view;
      const gone = state.status !== "cleared" && leadGone(dir, view.id);
      return { ...view, designReview: { ...state, ...(gone ? { leadGone: true } : {}) } };
    },

    /** The user clears story `id`'s design review, and it moves on to Acceptance. */
    clear: (dir: string, id: string): Promise<null> =>
      lane.exclusive(async () => {
        const none = DESIGN_REVIEW_MESSAGES.none(id);
        await marks.mark(
          dir,
          id,
          waits(id),
          { gone: none, readOnly: DESIGN_REVIEW_MESSAGES.readOnly },
          (card, config) => {
            const at = toIso(now());
            const cleared = appendHistory(card, { at, field: "design-review", from: null, to: "cleared", by: "user" });
            return setStatus(cleared, stageCeiling(config) ?? card.status, "user", at);
          },
        );
        return null;
      }),
  };
}

export type DesignReviews = ReturnType<typeof createDesignReviews>;
