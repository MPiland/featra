import { CARD_COPY, type AcceptActions } from "../../card-pane.ts";
import { SendBack } from "./SendBack.tsx";
import { useAction } from "./useAction.ts";

/**
 * Accept and Send back for a story waiting in Acceptance (STORY-23): at the end of its session, in its card pane and in
 * its Work row, from the same state. Both are the user's own action; Accept has no confirmation. A refusal shows in one
 * sentence next to the button, which stays. Send back asks for a reason, and offers it as a new acceptance criterion.
 */
export function AcceptStory({ id, actions }: { id: string; actions: AcceptActions }) {
  const { busy, error, run } = useAction();
  return (
    <span className="accept-story">
      <button
        type="button"
        className="review-draft"
        disabled={busy}
        aria-label={CARD_COPY.acceptOf(id)}
        onClick={() => void run(() => actions.accept(id))}
      >
        {CARD_COPY.accept}
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
  );
}
