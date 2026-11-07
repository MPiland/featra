import type { Segment } from "@featra/work-format/work-list";

/** A segmented count bar, one slice per item, coloured by tone. Decorative: the label beside it says the count. */
export function Bar({ segments, total }: { segments: readonly Segment[]; total: number }) {
  const shown = segments.reduce((n, s) => n + s.count, 0);
  return (
    <span className="pbar" aria-hidden="true">
      {segments.map((s) => (
        <i key={s.tone} className={`tone-${s.tone}`} style={{ flex: s.count }} />
      ))}
      {total > shown && <i style={{ flex: total - shown }} />}
    </span>
  );
}

export function Progress({ label, segments, total }: { label: string; segments: readonly Segment[]; total: number }) {
  return (
    <span className="prog">
      <span className="pl">{label}</span>
      <Bar segments={segments} total={total} />
    </span>
  );
}
