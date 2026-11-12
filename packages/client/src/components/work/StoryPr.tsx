import { CARD_COPY, PR_COPY, type CardView, type ReviewResult } from "../../card-pane.ts";
import { PrChip } from "./PrChip.tsx";
import { useAction } from "./useAction.ts";

/**
 * The card's PR section (STORY-11): the PR chip once the story has a PR; while it has none, Create PR when GitHub is
 * usable and the story is in review in its worktree, "Opening PR…" while Featra pushes and opens it, and why the last
 * try failed.
 */
export function StoryPr({ view, onCreate }: { view: CardView; onCreate: () => Promise<ReviewResult> }) {
  const { busy, error, run } = useAction();
  const pr = view.prState;
  const opening = busy || pr?.opening === true;
  return (
    <section className="card-sec" aria-label={CARD_COPY.pr}>
      <h3 className="sh">
        <span>{CARD_COPY.pr}</span>
        {!view.pr && pr?.create && (
          <button type="button" className="review-draft" disabled={opening} onClick={() => void run(onCreate)}>
            {PR_COPY.create}
          </button>
        )}
      </h3>
      {view.pr ? (
        <p>
          <PrChip url={view.pr} status={pr?.status} />
        </p>
      ) : opening ? (
        <p role="status">{PR_COPY.opening}</p>
      ) : (
        <p className="meta">{CARD_COPY.none}</p>
      )}
      {!view.pr && pr?.note && <p className="meta">{pr.note}</p>}
      {error && (
        <p className="card-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
