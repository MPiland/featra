import { useState } from "react";
import { ASK_MODE, modeLabel, modeWhere } from "@featra/work-format/modes";
import { EFFORTS, sourceTag, type Effort, type Role } from "@featra/work-format/roles";
import { EFFORT_OPTIONS, modelOptions, ROLES_COPY } from "../../roles-page.ts";
import type { RoleEdit, RoleEditResult } from "../../roles-bridge.ts";
import { Dropdown } from "../controls/Dropdown.tsx";
import { InlineText, type InlineRefusal } from "../controls/InlineText.tsx";

export interface RoleEditorProps {
  role: Role;
  /** Makes one change to the project's roles; the list then arrives from the watch. */
  onEdit: (edit: RoleEdit) => Promise<RoleEditResult>;
}

const asEffort = (value: string): Effort => EFFORTS.find((e) => e === value) ?? "medium";

/**
 * One role: its prompt, model and effort for a built-in or custom role (saved as the project's file), read-only for a
 * provider's agent, which Customize copies into the project. The mode is the provider's own setting, shown, not set.
 */
export function RoleEditor({ role, onEdit }: RoleEditorProps) {
  const { source } = role;
  const provider = source.kind === "provider";
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (edit: RoleEdit) => {
    const result = await onEdit(edit);
    setError(result.ok ? null : result.error);
    return result;
  };
  const refusal = async (edit: RoleEdit, current: string): Promise<InlineRefusal | null> => {
    const result = await onEdit(edit);
    return result.ok ? null : { error: result.error, current };
  };
  const save = (patch: Partial<Pick<Role, "prompt" | "model" | "effort">>) =>
    run({ action: "save", id: role.id, ...patch });
  const mode = role.mode ?? ASK_MODE;
  const act = (action: "reset" | "duplicate" | "customize" | "delete") => run({ action, id: role.id });

  return (
    <section className="role-editor" aria-label={role.name}>
      <div className="role-editor-head">
        {source.kind === "custom" ? (
          <InlineText
            label={ROLES_COPY.name}
            value={role.name}
            className="role-editor-name"
            nowLabel={ROLES_COPY.now}
            onSave={(to, from) => refusal({ action: "rename", id: role.id, name: to }, from)}
          />
        ) : (
          <h3>{role.name}</h3>
        )}
        <span className="role-tag">{sourceTag(source)}</span>
      </div>
      {role.description && <p className="settings-intro">{role.description}</p>}
      {role.note && <p className="chat-note">{role.note}</p>}
      <div className="role-fields">
        <InlineText
          label={ROLES_COPY.prompt}
          value={role.prompt}
          placeholder={ROLES_COPY.noPrompt}
          multiline
          readOnly={provider}
          nowLabel={ROLES_COPY.now}
          onSave={(to) => refusal({ action: "save", id: role.id, prompt: to }, role.prompt)}
        />
        {provider ? (
          <p className="role-readout">
            {ROLES_COPY.model}: {role.model} · {ROLES_COPY.effort}: {role.effort}
          </p>
        ) : (
          <div className="role-choices">
            <Dropdown
              name={ROLES_COPY.model}
              value={role.model}
              options={modelOptions(role.model)}
              onChange={(model) => void save({ model })}
            />
            <Dropdown
              name={ROLES_COPY.effort}
              value={role.effort}
              options={EFFORT_OPTIONS}
              onChange={(effort) => void save({ effort: asEffort(effort) })}
            />
          </div>
        )}
        <p className="role-readout" title={modeWhere(mode) ?? undefined}>
          {ROLES_COPY.mode}: <span className={mode.fullAccess ? "role-full" : undefined}>{modeLabel(mode)}</span>
        </p>
      </div>
      {error && (
        <p role="alert" className="setting-error">
          {error}
        </p>
      )}
      {provider && <p className="settings-intro">{ROLES_COPY.providerHelp}</p>}
      <div className="role-actions">
        {provider && (
          <button type="button" className="btn primary" onClick={() => void act("customize")}>
            {ROLES_COPY.customize}
          </button>
        )}
        {source.kind === "built-in" && source.edited && (
          <button type="button" className="btn" onClick={() => void act("reset")}>
            {ROLES_COPY.reset}
          </button>
        )}
        {!provider && (
          <button type="button" className="btn" onClick={() => void act("duplicate")}>
            {ROLES_COPY.duplicate}
          </button>
        )}
        {source.kind === "custom" &&
          (confirming ? (
            <span role="group" aria-label={ROLES_COPY.confirmDelete} className="role-confirm">
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  setConfirming(false);
                  void act("delete");
                }}
              >
                {ROLES_COPY.delete}
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                {ROLES_COPY.cancel}
              </button>
            </span>
          ) : (
            <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
              {ROLES_COPY.delete}
            </button>
          ))}
      </div>
    </section>
  );
}
