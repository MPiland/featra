import { CARD_COPY } from "../../card-pane.ts";
import type { CardView, ReviewResult } from "../../card-pane.ts";
import { useAction } from "./useAction.ts";

/**
 * A story's checks on this computer (STORY-56): whether they are running, how the last run ended with the failing
 * output when it failed, and Re-run. Absent when CI runs them (the card has no checks then).
 */
export function StoryChecks({
  checks,
  readOnly,
  onRerun,
}: {
  checks: NonNullable<CardView["checks"]>;
  readOnly: boolean;
  onRerun: () => Promise<ReviewResult>;
}) {
  const { busy, error, run } = useAction();
  const { running, idle, last, note } = checks;
  const failed = last !== null && !last.passed && !running;
  const status = running
    ? CARD_COPY.checks.running
    : last
      ? last.passed
        ? CARD_COPY.checks.passed
        : CARD_COPY.checks.failed
      : (idle ?? CARD_COPY.checks.none);
  return (
    <section className="card-sec" aria-label={CARD_COPY.checks.title}>
      <h3 className="sh">
        <span>{CARD_COPY.checks.title}</span>
        {!readOnly && (
          <button type="button" className="review-draft" disabled={busy || running} onClick={() => void run(onRerun)}>
            {CARD_COPY.checks.rerun}
          </button>
        )}
      </h3>
      <p className={failed ? "checks-status bad" : "checks-status"} role="status">
        {status}
        {last && !running && <code title={last.command}>{last.command}</code>}
      </p>
      {note && <p className="meta">{note}</p>}
      {error && (
        <p className="card-error" role="alert">
          {error}
        </p>
      )}
      {failed && (
        <pre className="checks-output" aria-label={CARD_COPY.checks.output}>
          {last.output}
        </pre>
      )}
    </section>
  );
}
