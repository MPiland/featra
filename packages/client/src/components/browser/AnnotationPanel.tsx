import { useEffect, useRef } from "react";
import { ANNOTATE_COPY, type AnnotateBridge, type Annotation, type AnnotationsState } from "../../annotations.ts";
import { AnnotationDetails } from "./AnnotationDetails.tsx";

type Host = Pick<AnnotateBridge, "editAnnotation" | "comment" | "removeAnnotation">;

/**
 * One annotation open to edit: its comment (sent to the main process as it is typed), its screenshot, what it
 * captured, Done and Delete. It takes focus when it opens, from the list or the page's marker. Escape closes it.
 */
function AnnotationEditor(props: { host: Host; pageKey: string; annotation: Annotation; n: number }) {
  const { host, pageKey, annotation: a, n } = props;
  const field = useRef<HTMLTextAreaElement>(null);
  // Mounted once per annotation opened (its list item is keyed by its id).
  useEffect(() => field.current?.focus(), []);
  const close = () => host.editAnnotation(pageKey, null);
  return (
    <div className="annotation-editor">
      <label className="annotation-comment">
        <span>{ANNOTATE_COPY.comment}</span>
        <textarea
          ref={field}
          rows={3}
          defaultValue={a.comment}
          placeholder={ANNOTATE_COPY.commentHint}
          onChange={(e) => host.comment(pageKey, a.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            // The editor's own Escape: the pane stays open.
            e.preventDefault();
            close();
          }}
        />
      </label>
      {a.screenshot && <img className="annotation-shot" src={a.screenshot} alt={ANNOTATE_COPY.screenshot(n)} />}
      <details className="annotation-more">
        <summary>{ANNOTATE_COPY.details}</summary>
        <AnnotationDetails annotation={a} />
      </details>
      <div className="annotation-actions">
        <button type="button" className="btn" onClick={() => host.removeAnnotation(pageKey, a.id)}>
          {ANNOTATE_COPY.delete}
        </button>
        <button type="button" className="btn primary" onClick={close}>
          {ANNOTATE_COPY.done}
        </button>
      </div>
    </div>
  );
}

/**
 * The pane's annotations (STORY-75), numbered as their markers on the page. Each opens to edit; the main process owns
 * the list, so every change is asked of it and shows when it says.
 */
export function AnnotationPanel(props: { host: Host; pageKey: string; state: AnnotationsState }) {
  const { host, pageKey, state } = props;
  if (!state.list.length) return null;
  return (
    <section className="annotations" aria-label={ANNOTATE_COPY.list}>
      <h3 className="annotations-title">
        {ANNOTATE_COPY.list} <span className="meta">{state.list.length}</span>
      </h3>
      <ol className="annotation-list">
        {state.list.map((a, i) => {
          const open = state.editing === a.id;
          return (
            <li key={a.id} className={open ? "annotation open" : "annotation"}>
              <button
                type="button"
                className="annotation-row"
                aria-expanded={open}
                aria-label={`${ANNOTATE_COPY.marker(i + 1)}: ${a.comment || ANNOTATE_COPY.noComment}`}
                onClick={() => host.editAnnotation(pageKey, open ? null : a.id)}
              >
                <span className="annotation-n" aria-hidden="true">
                  {i + 1}
                </span>
                <span className={a.comment ? "annotation-text" : "annotation-text meta"}>
                  {a.comment || ANNOTATE_COPY.noComment}
                </span>
              </button>
              {open && <AnnotationEditor host={host} pageKey={pageKey} annotation={a} n={i + 1} />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
