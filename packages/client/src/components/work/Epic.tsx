import { useId, useState } from "react";
import type { EpicRow } from "@featra/work-format/work-list";
import { WORK_COPY } from "../../work-list.ts";
import { ChevronRightIcon } from "../icons.tsx";
import { Progress } from "./Bar.tsx";
import { Feature } from "./FeatureRows.tsx";

/** An epic's header, which folds its features away, and the features on one grid. */
export function Epic({ epic }: { epic: EpicRow }) {
  const [open, setOpen] = useState(true);
  const heading = useId();
  const title = epic.id === null ? WORK_COPY.noEpic : epic.title;
  return (
    <section className={open ? "epicblk" : "epicblk closed"} aria-labelledby={heading} data-card={epic.id ?? undefined}>
      <div className="epich">
        <h2 id={heading}>
          <button type="button" className="row-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <ChevronRightIcon />
            <span>{title}</span>
          </button>
        </h2>
        {epic.id !== null && <span className="meta">{WORK_COPY.epic}</span>}
        <Progress label={epic.progress.label} segments={epic.bar} total={epic.progress.total} />
      </div>
      {open && (
        <div className="fl" role="table" aria-label={title}>
          <div className="frow hdr" role="row">
            <span aria-hidden="true" />
            {WORK_COPY.columns.map((c) => (
              <span key={c} role="columnheader">
                {c}
              </span>
            ))}
          </div>
          {epic.features.map((f) => (
            <Feature key={f.id ?? "none"} feature={f} />
          ))}
        </div>
      )}
    </section>
  );
}
