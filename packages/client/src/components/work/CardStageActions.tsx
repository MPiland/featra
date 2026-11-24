import type { CardBridge, CardView } from "../../card-pane.ts";
import { AcceptStory } from "./AcceptStory.tsx";
import { HoldStory } from "./HoldStory.tsx";
import { PreviewStory } from "./PreviewStory.tsx";
import { MergeStory } from "./MergeStory.tsx";
import { AbandonStory } from "./AbandonStory.tsx";
import { ReviewButton } from "./ReviewButton.tsx";
import { StoryAgent } from "./story-agents.tsx";

export interface CardStageActionsProps {
  work: CardBridge;
  dir: string;
  id: string;
  view: CardView;
  readOnly: boolean;
  /** The card went away (a story abandoned and discarded): the pane closes. */
  onClose: () => void;
}

/**
 * What the card pane offers for where a story or feature is in its flow: a story's agent, Accept and Send back,
 * Merge, Hold and Abandon; Preview, when the project's proof offers it (STORY-25); a feature's review screen (STORY-69), where it is approved and merged (STORY-70).
 */
export function CardStageActions({ work, dir, id, view, readOnly, onClose }: CardStageActionsProps) {
  return (
    <>
      {view.type === "story" && (
        <div className="draft-actions card-agent">
          <StoryAgent id={id} />
        </div>
      )}
      {view.preview && (
        <div className="draft-actions card-actions">
          <PreviewStory key={`preview-${id}`} id={id} preview={(story) => work.previewStory(dir, story)} />
        </div>
      )}
      {view.awaiting && !readOnly && (
        <div className="draft-actions card-actions">
          <AcceptStory
            key={`accept-${id}`}
            id={id}
            actions={{
              accept: (story) => work.acceptStory(dir, story),
              sendBack: (story, reason, addCriterion) => work.sendBackStory(dir, story, reason, addCriterion),
            }}
          />
        </div>
      )}
      {view.type === "story" && (!readOnly || view.abandonable === true) && (
        <div className="draft-actions card-actions">
          <MergeStory
            key={`merge-${id}`}
            id={id}
            mergeable={view.mergeable === true}
            merge={(story) => work.mergeStory(dir, story)}
          />
          <HoldStory
            key={`hold-${id}`}
            id={id}
            held={view.held}
            hold={(story, held) => work.holdStory(dir, story, held)}
          />
          <AbandonStory
            key={`abandon-${id}`}
            id={id}
            abandonable={view.abandonable === true}
            actions={{
              check: (story) => work.abandonCheck(dir, story),
              abandon: (story, keep, token) => work.abandonStory(dir, story, keep, token),
            }}
            onDiscarded={onClose}
          />
        </div>
      )}
      {view.type === "feature" && (
        // A feature is approved and merged on its review screen (STORY-70): its card links there.
        <div className="draft-actions card-actions">
          <ReviewButton id={id} status={view.status} />
        </div>
      )}
    </>
  );
}
