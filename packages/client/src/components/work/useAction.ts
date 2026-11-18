import { useState } from "react";

/** A result that says whether it worked, with one sentence when it didn't. */
type Outcome = { ok: true } | { ok: false; error: string };

/**
 * Runs a button's action once at a time: `busy` while it runs, and its refusal or failure as one sentence in `error`,
 * which clears when the action is run again (or on `clear`). `done` runs when it worked. Shared by the story's Start,
 * Stop and Resume (STORY-9, STORY-53), and by a draft's Approve and Reject, whose card pane holds it so the buttons can
 * come and go while it runs without losing it (BUG-31).
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (call: () => Promise<Outcome>, done?: () => void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await call();
      if (result.ok) done?.();
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, clear: () => setError(null) };
}

export type Action = ReturnType<typeof useAction>;
