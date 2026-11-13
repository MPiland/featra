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

/**
 * New bug in Work (STORY-13): a title, a description and an optional suspected cause, then where it goes. Featra
 * proposes the place from the cause, and asks again when the cause changes; the user can pick another. Nothing is
 * written until Create.
 */
export function NewBug({ bugs, dir, list }: { bugs: BugBridge; dir: string; list: WorkList }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cause, setCause] = useState("");
  const [placements, setPlacements] = useState<BugPlacements | null>(null);
  const [placement, setPlacement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const titleField = useRef<HTMLInputElement>(null);
  const ids = { title: useId(), description: useId(), cause: useId() };

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    void bugs.proposeBug(dir, cause || null).then((r) => {
      if (!live) return;
      if (!r.ok) return setError(r.error);
      setPlacements(r.placements);
      setPlacement(r.placements.proposed);
    });
    return () => {
      live = false;
    };
  }, [bugs, dir, cause, open]);
  useEffect(() => {
    if (open) titleField.current?.focus();
  }, [open]);

  const reset = () => {
    setOpen(false);
    setTitle("");
    setDescription("");
    setCause("");
    setPlacements(null);
    setError(null);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !placement || busy) return;
    setBusy(true);
    setError(null);
    const r = await bugs.fileBug(dir, { title, description, cause: cause || null }, placement);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    reset();
    setNotice(r.kind === "card" ? BUG_COPY.filedCard(r.id) : BUG_COPY.filedTask(r.id));
  };

  if (!open)
    return (
      <div className="new-bug-bar">
        <button
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
          onChange={(e) => setCause(e.target.value)}
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
        <PlacementSelect placements={placements} value={placement} onChange={setPlacement} disabled={busy} />
      )}
      <div className="chat-approval-actions">
        <button type="submit" className="btn primary" disabled={busy || !title.trim() || !placements}>
          {busy ? BUG_COPY.creating : BUG_COPY.create}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={reset}>
          {BUG_COPY.cancel}
        </button>
      </div>
      {error && (
        <p className="work-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
