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
 * and shows it as a tooltip while hovered or focused (each tracked apart, so leaving with the mouse keeps it for the
 * keyboard). Escape dismisses it until the next hover or focus (WCAG 1.4.13). The tooltip only repeats the accessible
 * name, for sight, so a screen reader hears it once; with nothing in it to select or click, `pointer-events: none` on
 * it is acceptable. Without a breakdown the bar is decorative: the label beside it says the count.
 */
export function Bar({ segments, total, breakdown = "" }: BarProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const tip = (hovered || focused) && !dismissed;
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
  const show = (set: (on: boolean) => void) => {
    set(true);
    setDismissed(false);
  };
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
        onMouseEnter={() => show(setHovered)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => show(setFocused)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && tip) {
            e.stopPropagation();
            setDismissed(true);
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
