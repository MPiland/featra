import { useState } from "react";
import type { StaleRow } from "@featra/work-format/work-list";
import { WORK_COPY, type CopyActionResult } from "../../work-list.ts";

export interface StaleCopiesProps {
  stale: readonly StaleRow[];
  onApply: (key: string) => Promise<CopyActionResult>;
  onDiscard: (key: string) => Promise<CopyActionResult>;
}

/** Each uncommitted edit to a copy that is not the owner's: the user applies it to the owner or discards it. */
export function StaleCopies({ stale, onApply, onDiscard }: StaleCopiesProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!stale.length) return null;
  const run = async (key: string, action: (key: string) => Promise<CopyActionResult>) => {
    setBusy(key);
    const result = await action(key);
    setBusy(null);
    setErrors((e) => {
      const rest = Object.fromEntries(Object.entries(e).filter(([k]) => k !== key));
      return result.ok ? rest : { ...rest, [key]: result.error };
    });
  };
  return (
    <ul className="stale-copies" aria-label={WORK_COPY.stale}>
      {stale.map((s) => (
        <li key={s.key} className="stale-copy" aria-busy={busy === s.key} data-card={s.cardId}>
          <p>
            <strong>
              {s.cardId} · {WORK_COPY.stale}
            </strong>{" "}
            {WORK_COPY.staleDetail(s.where, s.owner)}
          </p>
          <span className="placeholder-actions">
            <button type="button" className="btn" disabled={busy !== null} onClick={() => void run(s.key, onApply)}>
              {WORK_COPY.apply}
            </button>
            <button type="button" className="btn" disabled={busy !== null} onClick={() => void run(s.key, onDiscard)}>
              {WORK_COPY.discard}
            </button>
          </span>
          {errors[s.key] && (
            <p className="stale-error" role="alert">
              {errors[s.key]}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
