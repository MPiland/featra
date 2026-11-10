import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CARD_COPY } from "../../card-pane.ts";

export interface SendBackProps {
  /** Sends the reason; answers with why not, or null once the chat has it. */
  onSend: (reason: string) => Promise<string | null>;
  /** Why Send back can't be used now (its chat is gone), or null. The button is disabled and says so. */
  unavailable: string | null;
}

/**
 * Send back… on a draft (STORY-50): a button that opens a small form for the reason. It can't be sent while the reason
 * is empty or only spaces, and a refusal is shown with the reason kept so it can be sent again.
 */
export function SendBack({ onSend, unavailable }: SendBackProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const hint = useId();
  const refocus = useRef(false);

  useEffect(() => {
    if (open) field.current?.focus();
    else if (refocus.current) {
      refocus.current = false;
      opener.current?.focus();
    }
  }, [open]);

  const close = () => {
    refocus.current = true;
    setOpen(false);
    setError(null);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || sending) return;
    setSending(true);
    const failed = await onSend(reason);
    setSending(false);
    if (failed === null) {
      setReason("");
      close();
    } else setError(failed);
  };
  // Escape here cancels the form, not the pane around it.
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    close();
  };

  if (!open)
    return (
      <div className="send-back">
        <button
          ref={opener}
          type="button"
          className="btn"
          disabled={unavailable !== null}
          aria-describedby={unavailable ? hint : undefined}
          onClick={() => setOpen(true)}
        >
          {CARD_COPY.sendBack}
        </button>
        {unavailable && (
          <span id={hint} className="meta">
            {unavailable}
          </span>
        )}
      </div>
    );
  return (
    <form className="send-back" aria-label={CARD_COPY.sendBackForm} onSubmit={(e) => void submit(e)}>
      <label className="sh" htmlFor={`${hint}-reason`}>
        {CARD_COPY.sendBackReason}
      </label>
      <textarea
        id={`${hint}-reason`}
        ref={field}
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={onKey}
        placeholder={CARD_COPY.sendBackHint}
      />
      {error && (
        <p className="card-error" role="alert">
          {error}
        </p>
      )}
      <div className="send-back-actions">
        <button type="submit" className="btn primary" disabled={!reason.trim() || sending}>
          {CARD_COPY.sendBackSend}
        </button>
        <button type="button" className="btn" onClick={close}>
          {CARD_COPY.sendBackCancel}
        </button>
      </div>
    </form>
  );
}
