import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { SEND_BACK_MAX } from "@featra/work-format";
import { CARD_COPY, type SendBackResult } from "../../card-pane.ts";

export interface SendBackProps {
  /** Sends the reason; answers with why not, or that the chat has it (and whether history recorded it). */
  onSend: (reason: string, addCriterion: boolean) => Promise<SendBackResult>;
  /** Offers to add the reason as a new acceptance criterion (a story sent back, STORY-23). */
  criterion?: boolean;
  /** Names the button and the form for assistive tech, where more than one card's Send back is on screen. */
  name?: string;
  /** Where the form opens when it should not open beside its button (below a Work row); the button stays put. */
  into?: HTMLElement | null;
  /** Why Send back can't be used now (its chat is gone), or null. The button is disabled and says so. */
  unavailable: string | null;
  /** Its words where it is another action with the same form: "Not yet" on a review screen (STORY-71). */
  copy?: Partial<SendBackCopy>;
}

/** The words the button and its form show. */
export interface SendBackCopy {
  open: string;
  form: string;
  reason: string;
  hint: string;
  send: string;
  cancel: string;
}

const SEND_BACK_COPY: SendBackCopy = {
  open: CARD_COPY.sendBack,
  form: CARD_COPY.sendBackForm,
  reason: CARD_COPY.sendBackReason,
  hint: CARD_COPY.sendBackHint,
  send: CARD_COPY.sendBackSend,
  cancel: CARD_COPY.sendBackCancel,
};

/** The counter shows once the reason is this close to the limit. */
const COUNT_FROM = SEND_BACK_MAX - 200;
const count = (n: number) => `${n.toLocaleString("en-US")} / ${SEND_BACK_MAX.toLocaleString("en-US")}`;

/**
 * Send back… on a draft (STORY-50): a button that opens a small form for the reason. It can't be sent while the reason
 * is empty or only spaces, or past the limit. A refusal is shown with the reason kept and focus back in the field, so it
 * can be sent again; if the chat has the message but history couldn't record it, the form closes and says so.
 */
export function SendBack({ onSend, unavailable, criterion = false, name, into = null, copy }: SendBackProps) {
  const words = { ...SEND_BACK_COPY, ...copy };
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [addCriterion, setAddCriterion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const hint = useId();
  const refocus = useRef(false);

  useEffect(() => {
    if (open) field.current?.focus();
    else if (refocus.current) {
      refocus.current = false;
      opener.current?.focus();
    }
  }, [open]);
  useEffect(() => {
    if (error) field.current?.focus();
  }, [error]);

  const close = useCallback(() => {
    refocus.current = true;
    setOpen(false);
    setError(null);
  }, []);
  // Escape anywhere in the form closes the form, and stops there: not the pane around it.
  useEffect(() => {
    const el = form.current;
    if (!open || !el) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [open, close]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await onSend(reason, criterion && addCriterion);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(result.recorded ? null : CARD_COPY.sendBackUnrecorded);
      setReason("");
      setAddCriterion(false);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  if (!open)
    return (
      <div className="send-back">
        <button
          ref={opener}
          type="button"
          className="btn"
          disabled={unavailable !== null}
          aria-label={name}
          aria-describedby={unavailable ? hint : undefined}
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
        >
          {words.open}
        </button>
        {unavailable && (
          <span id={hint} className="meta">
            {unavailable}
          </span>
        )}
        {notice && (
          <p className="meta" role="status">
            {notice}
          </p>
        )}
      </div>
    );
  const asking = (
    <form ref={form} className="send-back" aria-label={name ?? words.form} onSubmit={(e) => void submit(e)}>
      <label className="sh" htmlFor={`${hint}-reason`}>
        {words.reason}
      </label>
      <textarea
        id={`${hint}-reason`}
        ref={field}
        rows={3}
        value={reason}
        maxLength={SEND_BACK_MAX}
        aria-describedby={`${hint}-count`}
        onChange={(e) => setReason(e.target.value)}
        placeholder={words.hint}
      />
      <span id={`${hint}-count`} className="meta" aria-live="polite">
        {reason.length >= COUNT_FROM ? count(reason.length) : ""}
      </span>
      {criterion && (
        <label className="send-back-criterion">
          <input type="checkbox" checked={addCriterion} onChange={(e) => setAddCriterion(e.target.checked)} />{" "}
          {CARD_COPY.sendBackCriterion}
        </label>
      )}
      {error && (
        <p className="card-error" role="alert">
          {error}
        </p>
      )}
      <div className="send-back-actions">
        <button type="submit" className="btn primary" disabled={!reason.trim() || sending}>
          {words.send}
        </button>
        <button type="button" className="btn" onClick={close}>
          {words.cancel}
        </button>
      </div>
    </form>
  );
  return into ? createPortal(asking, into) : asking;
}
