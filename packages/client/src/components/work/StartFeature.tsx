import { useState } from "react";
import { CARD_COPY, type ReviewResult } from "../../card-pane.ts";

export interface StartFeatureProps {
  onStart: () => Promise<ReviewResult>;
  /** Called once it started: the button is gone then, so the pane takes focus back. */
  onStarted: () => void;
}

/**
 * Start on an approved feature (STORY-52): one button, no confirmation (it only makes a branch, nothing is deleted).
 * While it runs it is off; a refusal shows in an alert under it and the button stays. On success the feature is
 * active, so the pane stops offering it.
 */
export function StartFeature({ onStart, onStarted }: StartFeatureProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onStart();
      if (result.ok) onStarted();
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="draft-review">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void run()}>
          {CARD_COPY.start}
        </button>
      </div>
      {error && (
        <p className="card-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
