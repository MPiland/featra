import type { ChatSummary } from "@featra/work-format/chat-list";
import { featureRowOf, storyChat } from "@featra/work-format/feature-progress";
import type { WorkList } from "@featra/work-format/work-list";
import { PROGRESS_COPY, type WorkBridge } from "../../work-list.ts";
import { CardPane } from "./CardPane.tsx";
import { FeatureProgress } from "./FeatureProgress.tsx";
import { PaneHandle } from "./PaneHandle.tsx";
import type { useDockedPane } from "./useDockedPane.ts";

/**
 * What the right pane shows: one card, or one feature's progress (STORY-24). One pane at a time: opening either
 * replaces the other. A card opened from a progress pane keeps that feature (`progress`), so it can go back to it.
 */
export type Docked =
  | { kind: "card"; id: string; focus: boolean; from?: string; progress?: string }
  | { kind: "progress"; feature: string; focus: boolean };

export interface SidePaneProps {
  docked: Docked;
  /** Shows something else in the pane. */
  onDock: (next: Docked) => void;
  onClose: () => void;
  work: WorkBridge;
  dir: string;
  /** The width and handle of the host's split (`useDockedPane`), shared by both panes. */
  layout: Pick<ReturnType<typeof useDockedPane>, "split" | "width" | "onMove" | "choose">;
  paneId: string;
  /** The live Work list the host already watches: the progress pane reads its feature's row from it. */
  list: WorkList | undefined;
  chats: readonly ChatSummary[];
  /** Opens a story's session from the progress pane. */
  onOpenChat: (chat: string) => void;
  hasChat?: (chat: string) => boolean;
}

/**
 * The pane docked on the right of Work and of a chat (ADR 0017, ADR 0022): its handle, then the card pane or the
 * feature progress pane, at the width the user chose for both. A story in the progress pane opens its chat, or its
 * card when it has none; Card opens the feature's own card. Either card leads back to the progress pane.
 */
export function SidePane(props: SidePaneProps) {
  const { docked, onDock, onClose, work, dir, layout, paneId, list, chats, onOpenChat, hasChat } = props;
  const handle = (
    <PaneHandle
      width={layout.width}
      split={layout.split}
      paneId={paneId}
      onMove={layout.onMove}
      onChoose={layout.choose}
      onClose={onClose}
    />
  );
  if (docked.kind === "progress") {
    const { feature } = docked;
    return (
      <>
        {handle}
        <FeatureProgress
          key={`progress-${feature}`}
          id={feature}
          feature={list ? featureRowOf(list, feature) : null}
          loading={!list}
          chats={chats}
          paneId={paneId}
          width={layout.width}
          focusOnOpen={docked.focus}
          onStory={(story) => {
            const chat = storyChat(story, chats);
            if (chat) onOpenChat(chat);
            else onDock({ kind: "card", id: story.id, focus: true, progress: feature });
          }}
          onCard={() => onDock({ kind: "card", id: feature, focus: true, progress: feature })}
          onClose={onClose}
        />
      </>
    );
  }
  const { id, from, progress } = docked;
  return (
    <>
      {handle}
      <CardPane
        key={id}
        work={work}
        dir={dir}
        id={id}
        paneId={paneId}
        width={layout.width}
        focusOnOpen={docked.focus}
        openedFrom={from}
        hasChat={hasChat}
        back={
          progress
            ? {
                label: PROGRESS_COPY.backTo(progress),
                go: () => onDock({ kind: "progress", feature: progress, focus: true }),
              }
            : undefined
        }
        onOpen={(next) =>
          onDock({ kind: "card", id: next, focus: true, from: next === from ? undefined : id, progress })
        }
        onClose={onClose}
      />
    </>
  );
}
