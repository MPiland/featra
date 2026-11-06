import { THEME_OPTIONS } from "../../settings-pages.ts";
import type { ThemeChoice } from "../../theme.ts";
import { SegmentedControl } from "../controls/SegmentedControl.tsx";
import { SettingRow } from "../controls/SettingRow.tsx";
import { SettingsGroup } from "./SettingsGroup.tsx";

/** Appearance: the theme. */
export function AppearancePage({ theme, onTheme }: { theme: ThemeChoice; onTheme: (theme: ThemeChoice) => void }) {
  const id = "app-theme";
  return (
    <SettingsGroup>
      <SettingRow id={id} label="Theme">
        {(aria) => <SegmentedControl name={id} value={theme} options={THEME_OPTIONS} onChange={onTheme} {...aria} />}
      </SettingRow>
    </SettingsGroup>
  );
}
