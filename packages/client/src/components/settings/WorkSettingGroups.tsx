import {
  workSettingDef,
  type ChoiceDef,
  type WorkSettingDef,
  type WorkSettingKey,
  type WorkSettings,
} from "../../settings.ts";
import { WORK_GROUPS, type SettingsScope } from "../../settings-pages.ts";
import { SegmentedControl } from "../controls/SegmentedControl.tsx";
import { SettingRow, type OverrideMark } from "../controls/SettingRow.tsx";
import { Switch } from "../controls/Switch.tsx";
import { SettingsGroup } from "./SettingsGroup.tsx";

type WorkValue = WorkSettings[WorkSettingKey];

export interface WorkSettingGroupsProps {
  /** Prefixes the controls' ids, so each scope's are distinct: `app-progress`, `project-progress`. */
  scope: SettingsScope;
  values: WorkSettings;
  onChange: (key: WorkSettingKey, value: WorkValue) => void;
  disabled?: boolean;
  /** The override mark for a key, where the project overrides it. */
  override?: (key: WorkSettingKey) => OverrideMark | undefined;
  /** The groups' heading level: 4 inside a page section (the setup page). Default 3. */
  groupLevel?: 3 | 4;
}

/** The work settings in their groups: the app's defaults or one project's values. */
export function WorkSettingGroups(props: WorkSettingGroupsProps) {
  const { scope, values, onChange, disabled, override, groupLevel } = props;
  return WORK_GROUPS.map((g) => (
    <SettingsGroup key={g.title} title={g.title} level={groupLevel}>
      {g.keys.map((key) => (
        <WorkSettingRow
          key={key}
          id={`${scope}-${key}`}
          def={workSettingDef(key)}
          value={values[key]}
          onChange={(value) => onChange(key, value)}
          disabled={disabled}
          override={override?.(key)}
        />
      ))}
    </SettingsGroup>
  ));
}

function WorkSettingRow(props: {
  id: string;
  def: WorkSettingDef;
  value: WorkValue;
  onChange: (value: WorkValue) => void;
  disabled: boolean | undefined;
  override: OverrideMark | undefined;
}) {
  const { id, def, value, onChange, disabled, override } = props;
  return (
    <SettingRow id={id} label={def.label} help={def.help} override={override}>
      {(aria) =>
        def.kind === "toggle" ? (
          <Switch id={id} checked={value === true} onChange={onChange} disabled={disabled} {...aria} />
        ) : (
          <SegmentedControl
            name={id}
            value={String(value)}
            options={def.choices.map((c) => ({ value: String(c.value), label: c.label }))}
            onChange={(v) => {
              const choices: readonly ChoiceDef<WorkValue>[] = def.choices;
              const choice = choices.find((c) => String(c.value) === v);
              if (choice) onChange(choice.value);
            }}
            disabled={disabled}
            {...aria}
          />
        )
      }
    </SettingRow>
  );
}
