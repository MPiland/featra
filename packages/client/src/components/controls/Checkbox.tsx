export interface CheckboxProps {
  id?: string | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelledBy?: string | undefined;
  describedBy?: string | undefined;
  disabled?: boolean | undefined;
}

/** A native checkbox, named by its row: Tab reaches it, Space flips it. */
export function Checkbox({ id, checked, onChange, labelledBy, describedBy, disabled }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      id={id}
      className="checkbox"
      checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onChange={(e) => onChange(e.currentTarget.checked)}
    />
  );
}
