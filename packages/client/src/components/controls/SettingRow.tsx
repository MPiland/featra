import type { ReactNode } from "react";
import { appDefaultText } from "../../settings-pages.ts";

/** What a row shows beside its label when a project overrides the app default. */
export interface OverrideMark {
  defaultLabel: string;
  resetLabel: string;
  onReset(): void;
}

/** How the row's control names itself and finds its description: pass these to the control's aria attributes. */
export interface RowAria {
  labelledBy: string;
  describedBy: string | undefined;
}

export interface SettingRowProps {
  id: string;
  label: string;
  help?: string | undefined;
  /** A note under the description: why the control is disabled. */
  status?: string | undefined;
  override?: OverrideMark | undefined;
  children(aria: RowAria): ReactNode;
}

/** One setting: its label and a short description on the left, the control on the right. */
export function SettingRow({ id, label, help, status, override, children }: SettingRowProps) {
  // The override mark and a status note share an id: a row has one or the other.
  const describedBy = [help ? `${id}-help` : "", status || override ? `${id}-status` : ""].filter(Boolean).join(" ");
  return (
    <div className="setting-row">
      <div className="setting-text">
        <div className="setting-label">
          <span id={`${id}-label`}>{label}</span>
          {override && (
            <span className="override">
              <span id={`${id}-status`} title={appDefaultText(override.defaultLabel)}>
                Overridden<span className="sr-only">. {appDefaultText(override.defaultLabel)}</span>
              </span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                className="link"
                aria-label={override.resetLabel}
                title={appDefaultText(override.defaultLabel)}
                onClick={override.onReset}
              >
                Reset
              </button>
            </span>
          )}
        </div>
        {help && (
          <p className="setting-help" id={`${id}-help`}>
            {help}
          </p>
        )}
        {status && (
          <p className="setting-help" id={`${id}-status`}>
            {status}
          </p>
        )}
      </div>
      <div className="setting-control">{children({ labelledBy: `${id}-label`, describedBy: describedBy || undefined })}</div>
    </div>
  );
}
