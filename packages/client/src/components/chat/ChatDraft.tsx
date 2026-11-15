import { useEffect, useId, useRef, useState } from "react";
import type { ChatSummary } from "@featra/work-format/chat-list";
import { featuresLedBy } from "@featra/work-format/feature-progress";
import { PROGRESS_COPY, WORK_COPY, type WorkBridge } from "../../work-list.ts";
import type { ChosenWidth } from "../work/PaneHandle.tsx";
import { SidePane, type Docked } from "../work/SidePane.tsx";
import { useDockedPane } from "../work/useDockedPane.ts";
import { useWorkList } from "../work/useWorkList.ts";
import { ChatView, type ChatViewProps } from "./ChatView.tsx";
import { useStoryTurn } from "./useStoryTurn.ts";
import { chatDraft } from "./chat-draft.ts";

export interface ChatDraftProps extends ChatViewProps {
  work: WorkBridge;
  paneWidth: ChosenWidth;
  /** Opened from Review draft in Work: show the draft, and focus it, as soon as it is known. Called once it has. */
  review: (() => void) | null;
  /** The project's chats as the sidebar lists them: which features this chat leads, and its stories' sessions. */
  chatList: readonly ChatSummary[];
  /** Opens a chat: a story's session, from the feature progress pane (STORY-24). */
  onOpenChat: (chat: string) => void;
}

/**
 * A chat with its draft (STORY-49): the feature the chat drafted opens as a card pane docked beside it, full height,
 * and the user's edits there save to the owner copy like any card pane's. It opens by itself when the chat makes the
 * draft while it is open, leaving focus in the composer; Review draft in the header (or in Work) opens it otherwise.
 * A chat that leads a feature has Feature progress in its header, which opens that feature's progress in the same
 * place (STORY-24).
 */
export function ChatDraft({ work, paneWidth, review, chatList, onOpenChat, ...view }: ChatDraftProps) {
  const list = useWorkList(work, view.dir)?.list;
  const draft = chatDraft(list, view.chat.id);
  const led = list ? featuresLedBy(view.chat.id, list, chatList)[0]?.id : undefined;
  const [shown, setShown] = useState<Docked | null>(null);
  // What the draft was at the last render: it opening while the chat is open opens the pane (without focus).
  const [seen, setSeen] = useState<string | null | undefined>(undefined);
  // After the pane closes, focus goes to the button that brings it back.
  const refocus = useRef<"review" | "progress" | null>(null);
  const paneId = useId();
  const reopen = useRef<HTMLButtonElement>(null);
  const progressButton = useRef<HTMLButtonElement>(null);
  const { splitRef, split, width, onMove, choose } = useDockedPane(paneWidth);
  const storyTurn = useStoryTurn(work, view);
  if (draft !== seen) {
    setSeen(draft);
    if (draft && review) setShown({ kind: "card", id: draft, focus: true });
    else if (draft && seen === null) setShown({ kind: "card", id: draft, focus: false });
  }
  // Once the draft is shown (or there is none), the request is used up; coming back to the chat won't open it again.
  useEffect(() => {
    if (review && (shown || draft === null)) review();
  }, [review, shown, draft]);
  useEffect(() => {
    if (!refocus.current) return;
    const to = refocus.current === "progress" ? progressButton.current : reopen.current;
    refocus.current = null;
    to?.focus();
  });

  const close = () => {
    const fromProgress = shown?.kind === "progress" || (shown?.kind === "card" && shown.progress !== undefined);
    refocus.current = fromProgress ? "progress" : "review";
    setShown(null);
  };
  const progressShown = shown?.kind === "progress";
  const reviewButton =
    draft && shown?.kind !== "card" ? (
      <button
        ref={reopen}
        type="button"
        className="review-draft"
        onClick={() => setShown({ kind: "card", id: draft, focus: true })}
      >
        {WORK_COPY.reviewDraft}
      </button>
    ) : null;
  const progress = led ? (
    <button
      ref={progressButton}
      type="button"
      className="review-draft"
      aria-expanded={progressShown}
      aria-controls={progressShown ? paneId : undefined}
      onClick={() => (progressShown ? close() : setShown({ kind: "progress", feature: led, focus: true }))}
    >
      {PROGRESS_COPY.open}
    </button>
  ) : null;
  return (
    <div ref={splitRef} className="work-split">
      <ChatView
        {...view}
        headerExtra={
          reviewButton || progress ? (
            <>
              {reviewButton}
              {progress}
            </>
          ) : null
        }
        story={
          storyTurn && {
            ...storyTurn,
            actions: {
              stop: (id) => work.stopStory(view.dir, id),
              resume: (id) => work.resumeStory(view.dir, id),
            },
            acceptance: {
              accept: (id) => work.acceptStory(view.dir, id),
              sendBack: (id, reason, addCriterion) => work.sendBackStory(view.dir, id, reason, addCriterion),
            },
            merge: (id) => work.mergeStory(view.dir, id),
          }
        }
      />
      {shown && (
        <SidePane
          docked={shown}
          onDock={setShown}
          onClose={close}
          work={work}
          dir={view.dir}
          layout={{ split, width, onMove, choose }}
          paneId={paneId}
          list={list}
          chats={chatList}
          onOpenChat={onOpenChat}
        />
      )}
    </div>
  );
}
