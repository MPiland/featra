import { useEffect, useId, useRef, useState } from "react";
import { WORK_COPY, type WorkBridge } from "../../work-list.ts";
import { CardPane } from "../work/CardPane.tsx";
import { PaneHandle, type ChosenWidth } from "../work/PaneHandle.tsx";
import { useDockedPane } from "../work/useDockedPane.ts";
import { ChatView, type ChatViewProps } from "./ChatView.tsx";
import { useChatDraft } from "./useChatDraft.ts";

export interface ChatDraftProps extends ChatViewProps {
  work: WorkBridge;
  paneWidth: ChosenWidth;
  /** Opened from Review draft in Work: show the draft, and focus it, as soon as it is known. */
  review: boolean;
}

/**
 * A chat with its draft (STORY-49): the feature the chat drafted opens as a card pane docked beside it, full height,
 * and the user's edits there save to the owner copy like any card pane's. It opens by itself when the chat makes the
 * draft while it is open, leaving focus in the composer; Review draft in the header (or in Work) opens it otherwise.
 */
export function ChatDraft({ work, paneWidth, review, ...view }: ChatDraftProps) {
  const draft = useChatDraft(work, view.dir, view.chat.id);
  const [shown, setShown] = useState<{ id: string; focus: boolean } | null>(null);
  // What the draft was at the last render: it opening while the chat is open opens the pane (without focus).
  const [seen, setSeen] = useState<string | null | undefined>(undefined);
  const refocus = useRef(false);
  const paneId = useId();
  const reopen = useRef<HTMLButtonElement>(null);
  const { splitRef, split, width, onMove, choose } = useDockedPane(paneWidth);

  if (draft !== seen) {
    setSeen(draft);
    if (draft && review) setShown({ id: draft, focus: true });
    else if (draft && seen === null) setShown({ id: draft, focus: false });
  }
  // After the pane closes, focus goes to the button that brings it back.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    reopen.current?.focus();
  });

  const close = () => {
    refocus.current = true;
    setShown(null);
  };
  const reviewButton =
    draft && !shown ? (
      <button ref={reopen} type="button" className="review-draft" onClick={() => setShown({ id: draft, focus: true })}>
        {WORK_COPY.reviewDraft}
      </button>
    ) : null;
  return (
    <div ref={splitRef} className="work-split">
      <ChatView {...view} headerExtra={reviewButton} />
      {shown && (
        <>
          <PaneHandle width={width} split={split} paneId={paneId} onMove={onMove} onChoose={choose} onClose={close} />
          <CardPane
            key={shown.id}
            work={work}
            dir={view.dir}
            id={shown.id}
            paneId={paneId}
            width={width}
            focusOnOpen={shown.focus}
            onOpen={(id) => setShown({ id, focus: true })}
            onClose={close}
          />
        </>
      )}
    </div>
  );
}
