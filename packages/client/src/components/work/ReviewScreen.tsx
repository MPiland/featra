import { useEffect, useRef } from "react";
import { REVIEW_COPY, type FeatureReview, type ReviewItem } from "@featra/work-format/review";
import { CARD_COPY } from "../../card-pane.ts";
import type { WorkBridge } from "../../work-list.ts";
import { FeatureEnd } from "./FeatureEnd.tsx";
import { DiffLine, ExternalLink, ReviewItemCard } from "./ReviewItem.tsx";
import { StoryChecks } from "./StoryChecks.tsx";
import { StoryPr } from "./StoryPr.tsx";
import { useReview } from "./useReview.ts";

type Actions = Pick<WorkBridge, "rerunFeatureChecks" | "createFeaturePr" | "approveFeature" | "mergeFeature">;

function Items({ title, items, empty }: { title: string; items: ReviewItem[]; empty?: string }) {
  if (items.length === 0 && !empty) return null;
  return (
    <section className="card-sec rv-sec" aria-label={title}>
      <h3 className="sh">
        <span>{title}</span>
      </h3>
      {items.length === 0 ? (
        <p className="meta">{empty}</p>
      ) : (
        <ul className="rv-items">
          {items.map((i) => (
            <ReviewItemCard key={i.view.id} item={i} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The whole review, below its title. */
function ReviewBody({ review, dir, work }: { review: FeatureReview; dir: string; work: Actions }) {
  const { feature, progress, breakdown, scope, summary } = review;
  const id = feature.id;
  return (
    <>
      <div className="rv-meta rv-facts">
        <span>{progress.label}</span>
        {breakdown && <span>{breakdown}</span>}
        {scope.added > 0 && <span className="scope-added">{scope.addedBreakdown}</span>}
        {scope.openBugs > 0 && <span className="scope-bugs">{REVIEW_COPY.openBugs(scope.openBugs)}</span>}
        <DiffLine diff={review.diff} />
        {review.files && (
          <ExternalLink
            url={review.files}
            label={REVIEW_COPY.filesChanged}
            name={`${REVIEW_COPY.filesChanged}: ${id}`}
          />
        )}
      </div>
      <FeatureEnd
        id={id}
        approval={review.approval}
        actions={{ approve: () => work.approveFeature(dir, id), merge: () => work.mergeFeature(dir, id) }}
      />
      {summary && (
        // Only when the Dev Lead wrote one: no heading stands empty.
        <section className="card-sec rv-summary" aria-label={REVIEW_COPY.summary}>
          <h3 className="sh">
            <span>{REVIEW_COPY.summary}</span>
            <span className="rv-by">{REVIEW_COPY.byLead}</span>
          </h3>
          <p className="rv-summary-text">{summary.text}</p>
        </section>
      )}
      {feature.checks ? (
        <StoryChecks checks={feature.checks} readOnly={false} onRerun={() => work.rerunFeatureChecks(dir, id)} />
      ) : (
        <section className="card-sec" aria-label={CARD_COPY.checks.title}>
          <h3 className="sh">
            <span>{CARD_COPY.checks.title}</span>
          </h3>
          <p className="checks-status meta">{CARD_COPY.checks.none}</p>
        </section>
      )}
      {(feature.pr || feature.prState) && <StoryPr view={feature} onCreate={() => work.createFeaturePr(dir, id)} />}
      <Items title={REVIEW_COPY.stories} items={review.stories} empty={REVIEW_COPY.noStories} />
      <Items title={REVIEW_COPY.bugs} items={review.bugs} />
    </>
  );
}

/**
 * A feature's review screen (STORY-69): the whole feature on one screen, built by the server from its cards and git
 * at no token cost, and live while open, with Approve, which accepts and merges it (STORY-70). Back returns to the Work
 * list.
 */
export function ReviewScreen({
  work,
  dir,
  id,
  onBack,
}: {
  work: WorkBridge;
  dir: string;
  id: string;
  onBack: () => void;
}) {
  const { review, loading, error } = useReview(work, dir, id);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <section className="review-screen" aria-label={REVIEW_COPY.reviewOf(id)} data-view="review">
      <div className="rv-top">
        <button type="button" className="review-draft" onClick={onBack}>
          {REVIEW_COPY.back}
        </button>
      </div>
      <h2 className="rv-h" ref={heading} tabIndex={-1}>
        {review ? REVIEW_COPY.title(id, review.feature.title) : REVIEW_COPY.reviewOf(id)}
      </h2>
      {error && (
        <p className="work-error" role="alert">
          {error}
        </p>
      )}
      {review ? (
        <ReviewBody review={review} dir={dir} work={work} />
      ) : (
        <p className="meta">{loading ? REVIEW_COPY.loading : REVIEW_COPY.gone}</p>
      )}
    </section>
  );
}
