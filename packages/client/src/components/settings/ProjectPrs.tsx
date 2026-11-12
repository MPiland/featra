import { useEffect, useState } from "react";
import { isRefreshMinutes } from "@featra/work-format/checks";
import type { ChecksBridge, ChecksPatch, ChecksView } from "../../checks-bridge.ts";
import { PRS_PAGE_COPY as COPY } from "../../checks-bridge.ts";
import { SettingRow } from "../controls/SettingRow.tsx";
import { Switch } from "../controls/Switch.tsx";
import { SettingsGroup } from "./SettingsGroup.tsx";

/**
 * Project settings' Pull requests section (STORY-11): whether a story's PR opens when it moves to review, how often
 * open PRs are read again, and, in local mode, the one line on what GitHub is missing.
 */
export function ProjectPrs({ checks, dir }: { checks: ChecksBridge; dir: string }) {
  const [loaded, setLoaded] = useState<{ dir: string; view: ChecksView } | null>(null);
  const [minutes, setMinutes] = useState("");
  const [invalid, setInvalid] = useState(false);
  const view = loaded && loaded.dir === dir ? loaded.view : null;

  const show = (next: ChecksView) => {
    setLoaded({ dir, view: next });
    setMinutes(String(next.prRefreshMinutes));
    setInvalid(false);
  };
  useEffect(() => {
    let live = true;
    void checks.load(dir).then((next) => {
      if (!live) return;
      setLoaded({ dir, view: next });
      setMinutes(String(next.prRefreshMinutes));
    });
    return () => {
      live = false;
    };
  }, [checks, dir]);

  if (!view) return <p className="settings-intro">{COPY.loading}</p>;

  const change = async (patch: ChecksPatch) => show(await checks.set(dir, patch));
  const commitMinutes = () => {
    const n = Number(minutes.trim());
    if (!isRefreshMinutes(n) || minutes.trim() === "") return setInvalid(true);
    setInvalid(false);
    if (n !== view.prRefreshMinutes) void change({ prRefreshMinutes: n });
  };

  return (
    <section className="settings-group" aria-label={COPY.title}>
      <h3>{COPY.title}</h3>
      {view.github.missing && <p className="settings-intro">{view.github.missing}</p>}
      {view.error && (
        <p role="alert" className="setting-error">
          {view.error}
        </p>
      )}
      <SettingsGroup>
        <SettingRow id="prs-open" label={COPY.open} help={COPY.openHint}>
          {(aria) => (
            <Switch
              checked={view.openStoryPrs}
              labelledBy={aria.labelledBy}
              describedBy={aria.describedBy}
              onChange={(openStoryPrs) => void change({ openStoryPrs })}
            />
          )}
        </SettingRow>
        <SettingRow id="prs-minutes" label={COPY.minutes} help={COPY.minutesHint}>
          {(aria) => (
            <>
              <input
                type="number"
                className="text-field number-field"
                min={1}
                max={60}
                step={1}
                aria-labelledby={aria.labelledBy}
                aria-describedby={aria.describedBy}
                aria-invalid={invalid}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                onBlur={commitMinutes}
                onKeyDown={(e) => e.key === "Enter" && commitMinutes()}
              />
              {invalid && (
                <p role="alert" className="setting-error">
                  {COPY.minutesInvalid}
                </p>
              )}
            </>
          )}
        </SettingRow>
      </SettingsGroup>
    </section>
  );
}
