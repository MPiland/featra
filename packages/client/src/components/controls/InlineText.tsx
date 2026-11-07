import { useEffect, useRef, useState, type KeyboardEvent } from "react";

/** Why a save was refused, and the field's value now, so the user can compare. */
export interface InlineRefusal {
  error: string;
  current: string;
}

export interface InlineTextProps {
  /** The field's name, read with its value ("User story: As a builder, …"). */
  label: string;
  value: string;
  /** Shown when the value is empty. */
  placeholder?: string;
  multiline?: boolean;
  /** Shown as text, not editable. */
  readOnly?: boolean;
  className?: string;
  /** How the value now reads after a refusal ("Now: …"). */
  nowLabel: (value: string) => string;
  /** Saves `to` over `from`, the value the field started from: null when saved, or why not. */
  onSave: (to: string, from: string) => Promise<InlineRefusal | null>;
}

/**
 * Text that edits in place. Click it, or Enter on it, to edit; leaving the field saves, and Escape cancels. Enter
 * saves a one-line field, and Ctrl+Enter a multi-line one. While the field is open, a new value from outside doesn't
 * replace what the user typed. A refused save keeps the typed text in the field, with the refusal and the value
 * now; saving again then saves over that value.
 */
export function InlineText(props: InlineTextProps) {
  const { label, value, placeholder, multiline, readOnly, className, nowLabel, onSave } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [from, setFrom] = useState(value);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<InlineRefusal | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  // Refs, not state: a blur can fire after Escape or Enter in the same tick, and must not save again.
  const open = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    button.current?.focus();
  }, [editing]);

  const start = () => {
    setDraft(value);
    setFrom(value);
    setRefusal(null);
    open.current = true;
    setEditing(true);
  };
  const stop = (toButton: boolean) => {
    refocus.current = toButton;
    open.current = false;
    setRefusal(null);
    setEditing(false);
  };
  const commit = async (toButton: boolean) => {
    if (!open.current || busy.current) return;
    if (draft === from) return stop(toButton);
    busy.current = true;
    setSaving(true);
    const refused = await onSave(draft, from);
    busy.current = false;
    setSaving(false);
    if (!refused) return stop(toButton);
    setRefusal(refused);
    setFrom(refused.current);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // Escape cancels the edit, not anything behind it
      stop(true);
    } else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void commit(true);
    }
  };

  const classes = ["inline-text", className].filter(Boolean).join(" ");
  if (readOnly) return <div className={classes}>{value || <span className="meta">{placeholder}</span>}</div>;
  if (!editing) {
    return (
      <button ref={button} type="button" className={classes} aria-label={`${label}: ${value}`} onClick={start}>
        {value || <span className="meta">{placeholder}</span>}
      </button>
    );
  }
  const field = {
    className: `${classes} editing`,
    "aria-label": label,
    "aria-busy": saving,
    "aria-invalid": refusal !== null,
    value: draft,
    autoFocus: true,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onKeyDown: onKey,
    onBlur: () => void commit(false),
  };
  return (
    <div className="inline-edit">
      {multiline ? <textarea rows={Math.max(3, draft.split("\n").length)} {...field} /> : <input {...field} />}
      {refusal && (
        <div className="inline-refusal" role="alert">
          <span>{refusal.error}</span>
          <span className="meta">{nowLabel(refusal.current)}</span>
        </div>
      )}
    </div>
  );
}
