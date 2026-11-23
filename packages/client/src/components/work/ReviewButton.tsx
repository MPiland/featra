import { REVIEW_COPY } from "@featra/work-format/review";
import { ReviewIcon } from "../icons.tsx";
import { useOpenReview } from "./review-opener.tsx";

/**
 * Review on an active feature's Work row and on its card pane (STORY-69): opens the feature's review screen, whatever
 * stage its stories are in. Nothing shows for a feature not in progress, or where there is no review screen to open.
 * On the row it is an icon, like the progress pane's, so the name cell still reads as the feature's title and the
 * word Review stays the Draft badge's (STORY-8); in the card pane it is a button that says Review.
 */
export function ReviewButton({
  id,
  status,
  icon = false,
}: {
  id: string | null;
  status: string | null;
  icon?: boolean;
}) {
  const openReview = useOpenReview();
  if (!id || status !== "active" || !openReview) return null;
  return (
    <button
      type="button"
      className={icon ? "row-icon row-review" : "review-draft row-review"}
      aria-label={REVIEW_COPY.reviewOf(id)}
      title={icon ? REVIEW_COPY.review : undefined}
      onClick={() => openReview(id)}
    >
      {icon ? <ReviewIcon /> : REVIEW_COPY.review}
    </button>
  );
}
