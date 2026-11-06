export interface SwitchProps {
  id?: string | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelledBy?: string | undefined;
  describedBy?: string | undefined;
  disabled?: boolean | undefined;
}

/** An on/off switch: Tab reaches it, Space or Enter flips it. */
export function Switch({ id, checked, onChange, labelledBy, describedBy, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      className="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" aria-hidden="true" />
    </button>
  );
}
