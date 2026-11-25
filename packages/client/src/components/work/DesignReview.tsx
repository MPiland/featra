import { DESIGN_REVIEW_COPY, type DesignReviewView } from "@featra/work-format";
import { CARD_COPY, type ReviewResult, type SendBackResult } from "../../card-pane.ts";
import { SendBack } from "./SendBack.tsx";
import { useAction } from "./useAction.ts";

/** What the card pane's design review calls, when its Dev Lead chat is gone: the story's id. */
export interface DesignReviewActions {
  clear: (id: string) => Promise<ReviewResult>;
  sendBack: (id: string, reason: string, addCriterion: boolean) => Promise<SendBackResult>;
}

/**
 * A story's design review on its card pane (STORY-73, ADR 0045): where it stands, and the findings while they're open.
 * The Dev Lead that started the story reviews its screenshots; when that chat is gone, the card says so and the user
 * clears the review (the story moves on to Acceptance) or sends the story back.
 */
export function DesignReview({
  id,
  review,
  actions,
}: {
  id: string;
  review: DesignReviewView;
  /** Absent when the card is read-only here. */
  actions?: DesignReviewActions;
}) {
  const { busy, error, run } = useAction();
  return (
    <div className="design-review" role="group" aria-label={DESIGN_REVIEW_COPY.label}>
      <p className="design-review-status">
        {DESIGN_REVIEW_COPY.label}: {DESIGN_REVIEW_COPY.status[review.status]}
      </p>
      {review.status === "findings" && review.findings && <p className="design-review-findings">{review.findings}</p>}
      {review.leadGone && review.status !== "cleared" && (
        <>
          <p className="design-review-note">{DESIGN_REVIEW_COPY.leadGone(id)}</p>
          {actions && (
            <span className="story-action">
              <button
                type="button"
                className="review-draft"
                disabled={busy}
                onClick={() => void run(() => actions.clear(id))}
              >
                {DESIGN_REVIEW_COPY.clear}
              </button>
              {error && (
                <span className="card-error" role="alert">
                  {error}
                </span>
              )}
              <SendBack
                criterion
                name={CARD_COPY.sendBackOf(id)}
                unavailable={null}
                onSend={(reason, addCriterion) => actions.sendBack(id, reason, addCriterion)}
              />
            </span>
          )}
        </>
      )}
    </div>
  );
}
