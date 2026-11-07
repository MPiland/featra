import {
  effectiveWork,
  isOverridden,
  workSettingDef,
  workValueLabel,
  type WorkOverrides,
  type WorkSettingKey,
  type WorkSettings,
} from "../../settings.ts";
import { resetLabel } from "../../settings-pages.ts";
import { WorkSettingGroups } from "./WorkSettingGroups.tsx";

export interface ProjectWorkGroupsProps {
  defaults: WorkSettings;
  overrides: WorkOverrides;
  disabled?: boolean;
  /** The groups' heading level, for a page that puts them in a section. */
  groupLevel?: 3 | 4;
  /** A new value for a setting, or `null` to go back to the app default (Reset). */
  onSet: (key: WorkSettingKey, value: WorkSettings[WorkSettingKey] | null) => void;
}

/**
 * One project's work settings: each the app default or an override, marked and resettable. Settings > Project and the
 * project setup page (STORY-42) both show them.
 */
export function ProjectWorkGroups({ defaults, overrides, disabled, groupLevel, onSet }: ProjectWorkGroupsProps) {
  return (
    <WorkSettingGroups
      scope="project"
      values={effectiveWork(defaults, overrides)}
      disabled={disabled}
      groupLevel={groupLevel}
      onChange={onSet}
      override={(key) =>
        isOverridden(overrides, key)
          ? {
              defaultLabel: workValueLabel(key, defaults[key]),
              resetLabel: resetLabel(workSettingDef(key).label),
              onReset: () => onSet(key, null),
            }
          : undefined
      }
    />
  );
}
