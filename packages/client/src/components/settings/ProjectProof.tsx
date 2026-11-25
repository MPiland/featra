import { useEffect, useState } from "react";
import type { ProofMode } from "@featra/work-format/proof";
import type { ChecksBridge } from "../../checks-bridge.ts";
import { PROOF_PAGE_COPY as COPY, type ProofPatch, type ProofView } from "../../proof-bridge.ts";
import { SegmentedControl } from "../controls/SegmentedControl.tsx";
import { SettingRow } from "../controls/SettingRow.tsx";
import { SettingsGroup } from "./SettingsGroup.tsx";

type Field = "devServerCommand" | "devServerUrl" | "testScreenshots";
const FIELDS = ["devServerCommand", "devServerUrl", "testScreenshots"] as const satisfies Field[];
const EMPTY: Record<Field, string> = { devServerCommand: "", devServerUrl: "", testScreenshots: "" };
const draftOf = (view: ProofView): Record<Field, string> => ({
  devServerCommand: view.devServerCommand ?? "",
  devServerUrl: view.devServerUrl ?? "",
  testScreenshots: view.testScreenshots ?? "",
});

/**
 * Project settings' Proof section (STORY-25): the project's proof (the answer to the question asked when its first
 * feature was shaped), the dev server Featra starts for screenshots and Preview, and where the project's tests write
 * screenshots. A dev-server command changed through git runs only once the user confirms it here.
 */
export function ProjectProof({ checks, dir }: { checks: ChecksBridge; dir: string }) {
  const [loaded, setLoaded] = useState<{ dir: string; view: ProofView } | null>(null);
  const [draft, setDraft] = useState<Record<Field, string>>(EMPTY);
  const [saved, setSaved] = useState(false);
  const view = loaded && loaded.dir === dir ? loaded.view : null;

  /** Shows a save's answer; only the fields that save sent take the saved value, so one being typed is kept. */
  const show = (next: ProofView, sent: ProofPatch) => {
    setLoaded({ dir, view: next });
    const stored = draftOf(next);
    setDraft((now) => ({ ...now, ...Object.fromEntries(FIELDS.filter((f) => f in sent).map((f) => [f, stored[f]])) }));
  };
  useEffect(() => {
    let live = true;
    void checks.loadProof(dir).then((next) => {
      if (!live) return;
      setLoaded({ dir, view: next });
      setDraft(draftOf(next));
    });
    return () => {
      live = false;
    };
  }, [checks, dir]);

  if (!view) return <p className="settings-intro">{COPY.loading}</p>;

  const change = async (patch: ProofPatch) => {
    setSaved(false);
    const next = await checks.setProof(dir, patch);
    show(next, patch);
    setSaved(next.error === null);
  };
  const dirty = FIELDS.filter((f) => draft[f].trim() !== (view[f] ?? ""));
  const save = () => change(Object.fromEntries(dirty.map((f) => [f, draft[f].trim() === "" ? null : draft[f].trim()])));

  const field = (f: Field, label: string, help: string) => (
    <SettingRow id={`proof-${f}`} label={label} help={help}>
      {(aria) => (
        <>
          <input
            type="text"
            className="text-field"
            id={`proof-${f}-input`}
            aria-labelledby={aria.labelledBy}
            aria-describedby={aria.describedBy}
            value={draft[f]}
            spellCheck={false}
            onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
          />
          {f === "devServerCommand" && view.unconfirmed && (
            <div className="setting-help">
              <span>{COPY.changed}: </span>
              <code>{view.devServerCommand}</code>{" "}
              <button type="button" className="link" onClick={() => void change({ confirm: true })}>
                {COPY.confirm}
              </button>
            </div>
          )}
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
        <SettingRow
          id="proof-mode"
          label={COPY.proof}
          help={COPY.proofHint}
          status={view.proof ? undefined : COPY.notChosen}
        >
          {(aria) => (
            <SegmentedControl<ProofMode | "">
              name="proof-mode"
              value={view.proof ?? ""}
              options={COPY.modes}
              labelledBy={aria.labelledBy}
              describedBy={aria.describedBy}
              onChange={(proof) => {
                // The choice shows at once; the saved view replaces it (or puts it back, with why).
                setLoaded({ dir, view: { ...view, proof: proof || null } });
                void change({ proof: proof || null });
              }}
            />
          )}
        </SettingRow>
        {field("devServerCommand", COPY.command, COPY.commandHint)}
        {field("devServerUrl", COPY.url, COPY.urlHint)}
        {field("testScreenshots", COPY.shots, COPY.shotsHint)}
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
