import type { AppSettings, CloseButton, CloseToTraySupport } from "../../settings.ts";
import { closeButtonOptions } from "../../settings-pages.ts";
import { SegmentedControl } from "../controls/SegmentedControl.tsx";
import { SettingRow } from "../controls/SettingRow.tsx";
import { SettingsGroup } from "./SettingsGroup.tsx";

export interface GeneralPageProps {
  app: AppSettings;
  support: NonNullable<CloseToTraySupport>;
  onCloseButton(value: CloseButton): void;
}

/** General: what the window's close button does. */
export function GeneralPage({ app, support, onCloseButton }: GeneralPageProps) {
  const id = "app-closeButton";
  return (
    <SettingsGroup>
      <SettingRow id={id} label="Close button" status={support.available ? undefined : support.reason}>
        {(aria) => (
          <SegmentedControl
            name={id}
            // Without a tray, close always quits: show what really happens rather than a choice that does nothing.
            value={support.available ? app.closeButton : "quit"}
            options={closeButtonOptions(support)}
            onChange={onCloseButton}
            disabled={!support.available}
            {...aria}
          />
        )}
      </SettingRow>
    </SettingsGroup>
  );
}
