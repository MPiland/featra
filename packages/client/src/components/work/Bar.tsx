import { useState } from "react";
import type { Segment } from "@featra/work-format/work-list";

export interface BarProps {
  segments: readonly Segment[];
  total: number;
  /** What the bar stands for, from work-format (STORY-15): "1 done · 2 in progress". Empty leaves it decorative. */
  breakdown?: string;
}

/**
 * A segmented count bar, one slice per item, coloured by tone. With a breakdown it is a focusable image named by it,
 * and shows it as a tooltip while hovered or focused; Escape hides the tooltip (WCAG 1.4.13). The tooltip repeats the
 * name for sight only, so a screen reader hears it once. Without one it is decorative: the label beside it says the
 * count.
 */
export function Bar({ segments, total, breakdown = "" }: BarProps) {
  const [tip, setTip] = useState(false);
  const shown = segments.reduce((n, s) => n + s.count, 0);
  const slices = (
    <>
      {segments.map((s) => (
        <i key={s.tone} className={`tone-${s.tone}`} style={{ flex: s.count }} />
      ))}
      {total > shown && <i style={{ flex: total - shown }} />}
    </>
  );
  if (!breakdown) {
    return (
      <span className="pbar" aria-hidden="true">
        {slices}
      </span>
    );
  }
  return (
    <>
      {/* A Tab stop so a keyboard reaches what the bar says; its handlers only show and hide the tooltip. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <span
        className="pbar"
        role="img"
        aria-label={breakdown}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
        onFocus={() => setTip(true)}
        onBlur={() => setTip(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && tip) {
            e.stopPropagation();
            setTip(false);
          }
        }}
      >
        {slices}
      </span>
      {tip && (
        <span className="pbar-tip" aria-hidden="true">
          {breakdown}
        </span>
      )}
    </>
  );
}

export function Progress({ label, ...bar }: BarProps & { label: string }) {
  return (
    <span className="prog">
      <span className="pl">{label}</span>
      <Bar {...bar} />
    </span>
  );
}
