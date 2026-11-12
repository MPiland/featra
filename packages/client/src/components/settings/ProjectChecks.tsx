import { useEffect, useState } from "react";
import type { ChecksBridge, ChecksPatch, ChecksView } from "../../checks-bridge.ts";
import { CHECKS_PAGE_COPY as COPY } from "../../checks-bridge.ts";
import { SegmentedControl } from "../controls/SegmentedControl.tsx";
import { SettingRow } from "../controls/SettingRow.tsx";
import { SettingsGroup } from "./SettingsGroup.tsx";

const WHERE = [
  { value: "ci", label: COPY.ci },
  { value: "local", label: COPY.local },
] as const;

type Field = "command" | "testCommand";

/**
 * Project settings' Checks section (STORY-56): where checks run, the check command and the linked test command. A
 * command someone proposed is only filled in by "Use this"; nothing is applied until the user saves it.
 */
export function ProjectChecks({ checks, dir }: { checks: ChecksBridge; dir: string }) {
  // The section is kept with the folder it was read from, so switching folders shows nothing until the new one loads.
  const [loaded, setLoaded] = useState<{ dir: string; view: ChecksView } | null>(null);
  const [draft, setDraft] = useState<Record<Field, string>>({ command: "", testCommand: "" });
  const [saved, setSaved] = useState(false);
  const view = loaded && loaded.dir === dir ? loaded.view : null;

  const show = (next: ChecksView) => {
    setLoaded({ dir, view: next });
    setDraft({ command: next.command ?? "", testCommand: next.testCommand ?? "" });
  };
  useEffect(() => {
    let live = true;
    void checks.load(dir).then((next) => {
      if (!live) return;
      setLoaded({ dir, view: next });
      setDraft({ command: next.command ?? "", testCommand: next.testCommand ?? "" });
    });
    return () => {
      live = false;
    };
  }, [checks, dir]);

  if (!view) return <p className="settings-intro">{COPY.loading}</p>;

  const change = async (patch: ChecksPatch) => {
    setSaved(false);
    const next = await checks.set(dir, patch);
    show(next);
    setSaved(next.error === null);
  };
  const dirty = (["command", "testCommand"] as const).filter((f) => draft[f].trim() !== (view[f] ?? ""));
  const save = () => change(Object.fromEntries(dirty.map((f) => [f, draft[f].trim() === "" ? null : draft[f].trim()])));

  const field = (f: Field, label: string, help: string) => (
    <SettingRow id={`checks-${f}`} label={label} help={help}>
      {(aria) => (
        <>
          <input
            type="text"
            className="text-field"
            id={`checks-${f}-input`}
            aria-labelledby={aria.labelledBy}
            aria-describedby={aria.describedBy}
            value={draft[f]}
            spellCheck={false}
            onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
          />
          {view.proposals
            .filter((p) => p.field === f)
            .map((p) => (
              <div key={`${p.source}:${p.value}`} className="setting-help">
                <span>{COPY.proposed(p.source)}: </span>
                <code>{p.value}</code>{" "}
                <button type="button" className="link" onClick={() => setDraft({ ...draft, [f]: p.value })}>
                  {COPY.use}
                </button>
              </div>
            ))}
        </>
      )}
    </SettingRow>
  );

  return (
    <section className="settings-group" aria-label={COPY.title}>
      <h3>{COPY.title}</h3>
      <p className="settings-intro">{COPY.intro}</p>
      {view.error && (
        <p role="alert" className="setting-error">
          {view.error}
        </p>
      )}
      <SettingsGroup>
        <SettingRow id="checks-where" label={COPY.where} status={view.chosen ? undefined : view.reason}>
          {(aria) => (
            <SegmentedControl
              name="checks-where"
              value={view.where}
              options={WHERE}
              labelledBy={aria.labelledBy}
              describedBy={aria.describedBy}
              onChange={(where) => void change({ where })}
            />
          )}
        </SettingRow>
        {field("command", COPY.command, COPY.commandHint)}
        {field("testCommand", COPY.testCommand, COPY.testHint)}
        <div className="setting-row">
          <button type="button" className="btn primary" disabled={dirty.length === 0} onClick={() => void save()}>
            {COPY.save}
          </button>
          {saved && dirty.length === 0 && (
            <span role="status" className="setting-help">
              {COPY.saved}
            </span>
          )}
        </div>
      </SettingsGroup>
    </section>
  );
}
