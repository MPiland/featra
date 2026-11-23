import { useContext, type MouseEvent } from "react";
import { REVIEW_COPY, type DiffStat, type ReviewItem } from "@featra/work-format/review";
import { AcProof } from "./AcProof.tsx";
import { Status } from "./FeatureRows.tsx";
import { ExternalLinkContext } from "./PrChip.tsx";

/** A link that opens in the OS browser (the host's `openExternal`), as a PR chip's does. */
export function ExternalLink({ url, label, name }: { url: string; label: string; name?: string }) {
  const openExternal = useContext(ExternalLinkContext);
  const open = (e: MouseEvent) => {
    e.preventDefault();
    openExternal(url);
  };
  return (
    <a href={url} title={url} aria-label={name} onClick={open}>
      {label}
    </a>
  );
}

/** Files and lines changed, as git said; nothing while it's still being read. */
export function DiffLine({ diff }: { diff: DiffStat | null }) {
  if (!diff) return null;
  return <span className="rv-diff">{diff.files === 0 ? REVIEW_COPY.noDiff : REVIEW_COPY.diff(diff)}</span>;
}

/**
 * A story or bug on the review screen (STORY-69): its id, title and stage, whether it was added after the start, what
 * it changed and its PR's Files changed, its user story, and each criterion with its test, result and proving run.
 */
export function ReviewItemCard({ item }: { item: ReviewItem }) {
  const { view } = item;
  return (
    <li className="rv-item" data-card={view.id}>
      <div className="rv-name">
        <span className="card-id">{view.id}</span>
        <h4 className="rv-title">{view.title}</h4>
        <Status tone={item.tone} label={view.status} />
        {item.added && <span className="meta scope-added">{REVIEW_COPY.added}</span>}
      </div>
      <div className="rv-meta">
        <DiffLine diff={item.diff} />
        {item.files && (
          <ExternalLink
            url={item.files}
            label={REVIEW_COPY.filesChanged}
            name={`${REVIEW_COPY.filesChanged}: ${view.id}`}
          />
        )}
      </div>
      {view.description && <p className="rv-story">{view.description}</p>}
      {view.acs.length > 0 && (
        <ol className="rv-acs" aria-label={`${view.id} criteria`}>
          {view.acs.map((ac, i) => (
            // A criterion has no id of its own: its place is its name.
            // oxlint-disable-next-line react/no-array-index-key
            <li key={i} className={ac.done ? "ac" : "ac todo"}>
              <span className="rv-ac">{ac.text}</span>
              <AcProof ac={ac} />
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
