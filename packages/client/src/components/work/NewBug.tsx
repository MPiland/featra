import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { BUG_COPY, BUG_DESCRIPTION_MAX, BUG_TITLE_MAX, type BugPlacements } from "@featra/work-format/bug-copy";
import type { WorkList } from "@featra/work-format/work-list";
import type { BugBridge } from "../../bugs.ts";
import { storyRows } from "../../work-list.ts";
import { PlacementSelect } from "../bugs/PlacementSelect.tsx";

/** Every card a bug can be blamed on, as the cause select lists it: features, then stories and bugs. */
function causes(list: WorkList): { id: string; label: string }[] {
  const features = list.epics.flatMap((e) => e.features).flatMap((f) => (f.id ? [{ id: f.id, title: f.title }] : []));
  return [...features, ...storyRows(list)].map((c) => ({ id: c.id, label: `${c.id} ${c.title}` }));
}

/** The server's answer to one ask for the places: the places, or why there are none. */
type Answer = { key: string; placements?: BugPlacements; error?: string };

/**
 * New bug in Work (STORY-13): a title, a description and an optional suspected cause, then where it goes. Featra
 * proposes the place from the cause, and asks again when the cause changes or the server refused the place; the user
 * can pick another. Nothing is written until Create. Create and Cancel return focus to New bug.
 */
export function NewBug({ bugs, dir, list }: { bugs: BugBridge; dir: string; list: WorkList }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cause, setCause] = useState("");
  const [busy, setBusy] = useState(false);
  /** Why Create was refused. */
  const [fileError, setFileError] = useState<string | null>(null);
  /** Counts the server's refusals, so the places are asked for again after one. */
  const [refused, setRefused] = useState(0);
  /**
   * Each ask for the places has its own key, and its answer and the user's pick hold only for it: a new ask starts with
   * no earlier places, error or pick.
   */
  const asking = open ? JSON.stringify([dir, cause, refused]) : null;
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [picked, setPicked] = useState<{ key: string; value: string } | null>(null);
  const current = answer !== null && answer.key === asking ? answer : null;
  const placements = current?.placements ?? null;
  const proposeError = current?.error ?? null;
  const placement = picked !== null && picked.key === asking ? picked.value : (placements?.proposed ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const titleField = useRef<HTMLInputElement>(null);
  const newBugButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const ids = { title: useId(), description: useId(), cause: useId() };

  useEffect(() => {
    if (asking === null) return undefined;
    // A later ask supersedes this one: its answer is dropped, so it can't replace the later one's.
    const superseded = new AbortController();
    void bugs.proposeBug(dir, cause || null).then((r) => {
      if (superseded.signal.aborted) return;
      setAnswer(r.ok ? { key: asking, placements: r.placements } : { key: asking, error: r.error });
    });
    return () => superseded.abort();
  }, [bugs, dir, cause, asking]);
  useEffect(() => {
    if (open) titleField.current?.focus();
    else if (wasOpen.current) newBugButton.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const reset = () => {
    setOpen(false);
    setTitle("");
    setDescription("");
    setCause("");
    setAnswer(null);
    setPicked(null);
    setFileError(null);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !placement || busy) return;
    setBusy(true);
    setFileError(null);
    const r = await bugs.fileBug(dir, { title, description, cause: cause || null }, placement);
    setBusy(false);
    if (!r.ok) {
      setFileError(r.error);
      // The place may be gone: ask again, so the user picks from what is offered now.
      return setRefused((n) => n + 1);
    }
    reset();
    setNotice(r.kind === "card" ? BUG_COPY.filedCard(r.id) : BUG_COPY.filedTask(r.id));
  };

  if (!open)
    return (
      <div className="new-bug-bar">
        <button
          ref={newBugButton}
          type="button"
          className="btn"
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
        >
          {BUG_COPY.newBug}
        </button>
        {notice && (
          <p className="meta" role="status">
            {notice}
          </p>
        )}
      </div>
    );
  return (
    <form className="new-bug" aria-label={BUG_COPY.newBug} onSubmit={(e) => void submit(e)}>
      <div className="bug-field">
        <label htmlFor={ids.title}>{BUG_COPY.title}</label>
        <input
          ref={titleField}
          id={ids.title}
          type="text"
          className="text-field"
          maxLength={BUG_TITLE_MAX}
          value={title}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="bug-field">
        <label htmlFor={ids.description}>{BUG_COPY.description}</label>
        <textarea
          id={ids.description}
          className="text-field"
          rows={3}
          maxLength={BUG_DESCRIPTION_MAX}
          value={description}
          disabled={busy}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="bug-field">
        <label htmlFor={ids.cause}>{BUG_COPY.cause}</label>
        <select
          id={ids.cause}
          className="text-field"
          value={cause}
          disabled={busy}
          onChange={(e) => {
            setFileError(null);
            setCause(e.target.value);
          }}
        >
          <option value="">{BUG_COPY.noCause}</option>
          {causes(list).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      {placements && (
        <PlacementSelect
          placements={placements}
          value={placement}
          onChange={(value) => asking !== null && setPicked({ key: asking, value })}
          disabled={busy}
        />
      )}
      <div className="chat-approval-actions">
        <button type="submit" className="btn primary" disabled={busy || !title.trim() || !placements}>
          {busy ? BUG_COPY.creating : BUG_COPY.create}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={reset}>
          {BUG_COPY.cancel}
        </button>
      </div>
      {(fileError ?? proposeError) && (
        <p className="work-error" role="alert">
          {fileError ?? proposeError}
        </p>
      )}
    </form>
  );
}
