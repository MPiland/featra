import { useId } from "react";
import { burnUpDays, burnUpText, dayLabel, type BurnUp, type BurnUpDay } from "@featra/work-format/burn-up";
import type { Count } from "@featra/work-format/work-list";
import { PROGRESS_COPY } from "../../work-list.ts";

export interface BurnUpChartProps {
  chart: BurnUp;
  /** The feature row's count: the chart's last point, so the two always agree. */
  current: Count;
  now: Date;
}

/** The drawing's own units; it stretches to the pane's width, and its lines keep their width. */
const W = 300;
const H = 100;
const PAD = 3;

/** A step line through the points: flat until the next point's time, then up or down to its value. */
function stepPath(
  days: readonly BurnUpDay[],
  x: (i: number) => number,
  y: (v: number) => number,
  key: "scope" | "done",
) {
  return days.map((d, i) => (i === 0 ? `M${x(i)} ${y(d[key])}` : `H${x(i)} V${y(d[key])}`)).join(" ");
}

/**
 * A feature's burn-up (STORY-16): two step lines, scope and done, from the scope baseline to now, one point per local
 * day (work-format's `burnUpDays`). Drawn as plain SVG in the work tones: scope in the not-started grey, dashed, done in
 * the done green. The image is named by the current numbers, and a visually hidden table gives every point. It shows
 * what happened only: no forecast, trend or date to come (ADR 0005).
 */
export function BurnUpChart({ chart, current, now }: BurnUpChartProps) {
  const head = useId();
  const days = burnUpDays(chart, current, now);
  const t0 = Date.parse(days[0]?.at ?? chart.since);
  const span = Math.max(Date.parse(days.at(-1)?.at ?? chart.since) - t0, 1);
  const top = Math.max(1, ...days.map((d) => d.scope));
  const last = days.length - 1;
  const x = (i: number) => (i === last ? W : Math.round(((Date.parse(days[i]?.at ?? "") - t0) / span) * W * 10) / 10);
  const y = (v: number) => Math.round((H - PAD - (v / top) * (H - 2 * PAD)) * 10) / 10;
  const first = dayLabel(chart.since);
  const today = dayLabel(now);
  return (
    <section className="card-sec fp-burnup" aria-labelledby={head}>
      <h3 className="sh" id={head}>
        {PROGRESS_COPY.burnUp}
      </h3>
      <p className="fp-legend" aria-hidden="true">
        <span className="fp-key fp-key-scope">
          {PROGRESS_COPY.scope} {current.total}
        </span>
        <span className="fp-key fp-key-done">
          {PROGRESS_COPY.done} {current.done}
        </span>
      </p>
      <svg
        className="fp-chart"
        role="img"
        aria-label={burnUpText(current, chart.since)}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
      >
        <line className="fp-axis-line" x1="0" y1={y(0)} x2={W} y2={y(0)} />
        <path className="fp-line fp-line-scope" d={stepPath(days, x, y, "scope")} />
        <path className="fp-line fp-line-done" d={stepPath(days, x, y, "done")} />
      </svg>
      <p className="fp-days" aria-hidden="true">
        <span>{first}</span>
        {today !== first && <span>{today}</span>}
      </p>
      <table className="sr-only">
        <caption>{PROGRESS_COPY.burnUpByDay}</caption>
        <thead>
          <tr>
            <th scope="col">{PROGRESS_COPY.day}</th>
            <th scope="col">{PROGRESS_COPY.scope}</th>
            <th scope="col">{PROGRESS_COPY.done}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={`${d.kind}-${d.at}`}>
              <th scope="row">{d.label}</th>
              <td>{d.scope}</td>
              <td>{d.done}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
