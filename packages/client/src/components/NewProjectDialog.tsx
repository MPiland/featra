import { useId, useRef, useState } from "react";
import type { FeatraBridge } from "../bridge.ts";
import { projectNameError, type ProjectsSnapshot } from "../projects.ts";
import { Dialog } from "./Dialog.tsx";

export interface NewProjectDialogProps {
  projects: FeatraBridge["projects"];
  /** Where the folder goes unless the user picks another place. */
  location: string;
  /** The project was created and is now the current one. */
  onCreated: (projects: ProjectsSnapshot) => void;
  onClose: () => void;
}

/**
 * New Project…: a name and a location. The name is checked as it is typed; the host checks both again and creates the
 * folder, so its answer (the folder is already there, the location is gone) is shown here too.
 */
export function NewProjectDialog({ projects, location: start, onCreated, onClose }: NewProjectDialogProps) {
  const id = useId();
  const nameField = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState(start);
  const [hostError, setHostError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameError = name.trim() ? projectNameError(name) : null;
  const ready = !busy && name.trim() !== "" && nameError === null && location.trim() !== "";
  const error = nameError ?? hostError;

  const choose = async () => {
    const picked = await projects.chooseLocation(location);
    if (picked) {
      setLocation(picked);
      setHostError(null);
    }
  };
  const create = async () => {
    if (!ready) return;
    setBusy(true);
    const result = await projects.create(location.trim(), name);
    setBusy(false);
    if (result.ok) onCreated(result.projects);
    else setHostError(result.error);
  };

  return (
    <Dialog
      title="New Project"
      closeLabel="Cancel"
      onClose={onClose}
      initialFocus={nameField}
      onSubmit={() => void create()}
      actions={
        <button type="submit" className="btn primary" disabled={!ready}>
          Create
        </button>
      }
    >
      <label htmlFor={`${id}-name`}>Name</label>
      <input
        ref={nameField}
        id={`${id}-name`}
        className="text-field"
        value={name}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={nameError !== null}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => {
          setName(e.target.value);
          setHostError(null);
        }}
      />
      <label htmlFor={`${id}-location`}>Location</label>
      <div className="form-row">
        <input
          id={`${id}-location`}
          className="text-field"
          value={location}
          spellCheck={false}
          onChange={(e) => {
            setLocation(e.target.value);
            setHostError(null);
          }}
        />
        <button type="button" className="btn" onClick={() => void choose()}>
          Choose…
        </button>
      </div>
      <p id={`${id}-error`} className="form-error" role="alert">
        {error}
      </p>
    </Dialog>
  );
}
