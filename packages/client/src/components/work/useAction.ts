import { useState } from "react";

/** A result that says whether it worked, with one sentence when it didn't. */
type Outcome = { ok: true } | { ok: false; error: string };

/**
 * Runs a button's action once at a time: `busy` while it runs, and its refusal or failure as one sentence in `error`,
 * which clears when the action is run again. Shared by the story's Start, Stop and Resume (STORY-9, STORY-53).
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (call: () => Promise<Outcome>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await call();
      if (!result.ok) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}
