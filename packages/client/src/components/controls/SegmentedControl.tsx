import type { ChoiceDef } from "../../settings.ts";

export interface SegmentedControlProps<V extends string> {
  /** Names the radio group; each option's input id is `${name}-${value}`. */
  name: string;
  value: V;
  options: readonly ChoiceDef<V>[];
  onChange: (value: V) => void;
  /** Names the group when no visible label does. */
  label?: string | undefined;
  labelledBy?: string | undefined;
  describedBy?: string | undefined;
  disabled?: boolean | undefined;
}

/**
 * A radio group drawn as joined buttons. Tab reaches the chosen option and the arrow keys change it, as with any
 * radio group.
 */
export function SegmentedControl<V extends string>(props: SegmentedControlProps<V>) {
  const { name, value, options, onChange, label, labelledBy, describedBy, disabled } = props;
  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
    >
      {options.map((o) => (
        <label key={o.value} className="segment">
          <input
            type="radio"
            id={`${name}-${o.value}`}
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}
