import { useId } from "react";
import { BUG_COPY, type BugPlacements } from "@featra/work-format/bug-copy";

/**
 * Where a bug goes (STORY-13): Featra's proposal, chosen to start with and marked Proposed, and every other place it
 * can go. The same control in the Dev Lead's request card and Work's New bug.
 */
export function PlacementSelect({
  placements,
  value,
  onChange,
  disabled = false,
}: {
  placements: BugPlacements;
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="bug-field">
      <label htmlFor={id}>{BUG_COPY.placement}</label>
      <select
        id={id}
        className="text-field"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {placements.choices.map((c) => (
          <option key={c.key} value={c.key}>
            {c.key === placements.proposed ? `${c.label} (${BUG_COPY.proposed})` : c.label}
          </option>
        ))}
      </select>
    </div>
  );
}
