import type { AppSettings, CloseButton, CloseToTraySupport } from "../../settings.ts";
import { closeButtonOptions, inboxWaitOptions } from "../../settings-pages.ts";
import { Dropdown } from "../controls/Dropdown.tsx";
import { SegmentedControl } from "../controls/SegmentedControl.tsx";
import { SettingRow } from "../controls/SettingRow.tsx";
import { Switch } from "../controls/Switch.tsx";
import { SettingsGroup } from "./SettingsGroup.tsx";

export interface GeneralPageProps {
  app: AppSettings;
  support: NonNullable<CloseToTraySupport>;
  onChange: (patch: Partial<AppSettings>) => void;
}

/** General: what the window's close button does, and when an agent's request reaches the Inbox and the desktop. */
export function GeneralPage({ app, support, onChange }: GeneralPageProps) {
  const id = "app-closeButton";
  return (
    <>
      <SettingsGroup>
        <SettingRow id={id} label="Close button" status={support.available ? undefined : support.reason}>
          {(aria) => (
            <SegmentedControl
              name={id}
              // Without a tray, close always quits: show what really happens rather than a choice that does nothing.
              value={support.available ? app.closeButton : "quit"}
              options={closeButtonOptions(support)}
              onChange={(closeButton: CloseButton) => onChange({ closeButton })}
              disabled={!support.available}
              {...aria}
            />
          )}
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup title="Inbox and notifications">
        <SettingRow
          id="app-inboxWait"
          label="Inbox wait"
          help="How long a request waits in its chat before it is also in the Inbox."
        >
          {() => (
            <Dropdown
              name="Inbox wait"
              value={String(app.inboxWaitMinutes)}
              options={inboxWaitOptions(app.inboxWaitMinutes)}
              onChange={(v) => onChange({ inboxWaitMinutes: Number(v) })}
            />
          )}
        </SettingRow>
        <SettingRow
          id="app-notifications"
          label="Notifications"
          help="When Featra isn't focused, tell me as soon as an agent needs me."
        >
          {(aria) => (
            <Switch
              id="app-notifications"
              checked={app.notifications}
              onChange={(notifications) => onChange({ notifications })}
              {...aria}
            />
          )}
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
