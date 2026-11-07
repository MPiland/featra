import type { CardEdit, CardView } from "../../card-pane.ts";
import { CARD_COPY } from "../../card-pane.ts";
import { CheckIcon, CircleIcon } from "../icons.tsx";
import { InlineText, type InlineRefusal } from "../controls/InlineText.tsx";

/** Saves one edit; on a refusal, `pick` reads the field's value now from the card the server answered with. */
export type SaveEdit = (edit: CardEdit, pick: (view: CardView) => string) => Promise<InlineRefusal | null>;

interface SectionProps {
  view: CardView;
  save: SaveEdit;
}

function Heading({ title, count }: { title: string; count?: string }) {
  return (
    <h3 className="sh">
      <span>{title}</span>
      {count && <span className="meta">{count}</span>}
    </h3>
  );
}

function Check({ done }: { done: boolean }) {
  return done ? (
    <span className="chk" aria-hidden="true">
      <CheckIcon />
    </span>
  ) : (
    <span className="box0" aria-hidden="true" />
  );
}

/** A section edited as one block of text: the user story, the notes. */
export function TextSection(
  props: SectionProps & { field: "description" | "notes"; title: string; placeholder: string },
) {
  const { view, save, field, title, placeholder } = props;
  return (
    <section className="card-sec" aria-label={title}>
      <Heading title={title} />
      <InlineText
        label={title}
        value={view[field]}
        placeholder={placeholder}
        multiline
        readOnly={view.readOnly !== null}
        nowLabel={CARD_COPY.now}
        onSave={(to, from) => save({ field, from, to }, (v) => v[field])}
      />
    </section>
  );
}

export function AcSection({ view, save }: SectionProps) {
  const done = view.acs.filter((a) => a.done).length;
  return (
    <section className="card-sec" aria-label={CARD_COPY.acs}>
      <Heading title={CARD_COPY.acs} count={CARD_COPY.count(done, view.acs.length, "done")} />
      {view.acs.length === 0 && <p className="meta">{CARD_COPY.none}</p>}
      <ol className="card-items">
        {view.acs.map((ac, i) => (
          // An AC has no id of its own: its place is what an edit names.
          // oxlint-disable-next-line react/no-array-index-key
          <li key={i} className={ac.done ? "ac" : "ac todo"}>
            <Check done={ac.done} />
            <div className="ac-body">
              <InlineText
                label={`AC ${i + 1}`}
                value={ac.text}
                readOnly={view.readOnly !== null}
                nowLabel={CARD_COPY.now}
                onSave={(to, from) => save({ field: "ac", index: i, from, to }, (v) => v.acs[i]?.text ?? "")}
              />
              <div className={`proof proof-${ac.proof}`}>
                {ac.proof === "passed" ? <CheckIcon /> : <CircleIcon />}
                <span>{CARD_COPY.proof[ac.proof]}</span>
                {ac.test && <code>{ac.test}</code>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TaskSection({ view, save }: SectionProps) {
  const done = view.tasks.filter((t) => t.done).length;
  return (
    <section className="card-sec" aria-label={CARD_COPY.tasks}>
      <Heading title={CARD_COPY.tasks} count={CARD_COPY.count(done, view.tasks.length, "done")} />
      {view.tasks.length === 0 && <p className="meta">{CARD_COPY.none}</p>}
      <ul className="card-items">
        {view.tasks.map((t, i) => (
          // A task has no id of its own: its place is what an edit names.
          // oxlint-disable-next-line react/no-array-index-key
          <li key={i} className="task">
            <Check done={t.done} />
            <InlineText
              label={`Task ${i + 1}`}
              value={t.text}
              readOnly={view.readOnly !== null}
              nowLabel={CARD_COPY.now}
              onSave={(to, from) => save({ field: "task", index: i, from, to }, (v) => v.tasks[i]?.text ?? "")}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

const MARKS = ["reported", "verified", "proven", "accepted"] as const satisfies readonly (keyof CardView["evidence"])[];

/** The evidence marks, each lit when it holds. */
export function Evidence({ evidence }: { evidence: CardView["evidence"] }) {
  return (
    <ul className="ev" aria-label={CARD_COPY.evidence}>
      {MARKS.map((key) => (
        <li key={key} className={evidence[key] ? "y" : undefined}>
          {evidence[key] ? <CheckIcon /> : <CircleIcon />}
          <span>{CARD_COPY.marks[key]}</span>
          <span className="sr-only">{evidence[key] ? ": yes" : ": no"}</span>
        </li>
      ))}
    </ul>
  );
}
