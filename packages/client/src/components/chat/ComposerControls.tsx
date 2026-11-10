import type { ControlChoice } from "@featra/work-format/chat-controls";
import { CHAT_COPY } from "../../chats.ts";
import { Dropdown } from "../controls/Dropdown.tsx";
import type { ChatControlsModel } from "./use-chat-controls.ts";

/** The choices of a control, with the value the chat runs with kept in the list even when the provider didn't list it. */
function options(choices: readonly ControlChoice[], current: string) {
  const all = choices.some((c) => c.value === current)
    ? [...choices]
    : [{ value: current, label: current }, ...choices];
  return all.map((c) => ({ value: c.value, label: c.fullAccess ? `${c.label} (${CHAT_COPY.fullAccess})` : c.label }));
}

/**
 * Role, model, effort and mode, each in the provider's own names. A change applies from the next turn. A control the
 * provider has no choices for (an empty list) isn't shown.
 */
export function ComposerControls({
  model,
  onError,
}: {
  model: ChatControlsModel;
  onError: (why: string | null) => void;
}) {
  const { state, roles, change } = model;
  if (!state) return null;
  const { controls, settings } = state;
  const pick = (key: keyof typeof settings) => (value: string) => {
    onError(null);
    void change({ [key]: value }).then(onError);
  };
  return (
    <div className="composer-controls">
      {roles.length > 1 && (
        <Dropdown
          name={CHAT_COPY.role}
          value={settings.role}
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
          onChange={pick("role")}
        />
      )}
      {controls.models.length > 0 && (
        <Dropdown
          name={CHAT_COPY.model}
          value={settings.model}
          options={options(controls.models, settings.model)}
          onChange={pick("model")}
        />
      )}
      {controls.efforts.length > 0 && (
        <Dropdown
          name={CHAT_COPY.effort}
          value={settings.effort}
          options={options(controls.efforts, settings.effort)}
          onChange={pick("effort")}
        />
      )}
      {controls.modes.length > 0 && (
        <Dropdown
          name={CHAT_COPY.mode}
          value={settings.mode}
          options={options(controls.modes, settings.mode)}
          onChange={pick("mode")}
        />
      )}
    </div>
  );
}
