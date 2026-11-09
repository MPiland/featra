import { useEffect, useRef, useState, type FormEvent } from "react";
import { ROLES_COPY } from "../../roles-page.ts";
import type { RoleEditResult } from "../../roles-bridge.ts";

/** The New role button, which opens a name field; Create makes a custom role of that name. */
export function NewRole({ onCreate }: { onCreate: (name: string) => Promise<RoleEditResult> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);
  const close = () => {
    setOpen(false);
    setName("");
    setError(null);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await onCreate(name);
    if (result.ok) close();
    else setError(result.error);
  };
  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {ROLES_COPY.newRole}
      </button>
    );
  }
  return (
    <form className="role-new" onSubmit={(e) => void submit(e)}>
      <input
        aria-label={ROLES_COPY.name}
        aria-invalid={error !== null}
        value={name}
        ref={field}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.stopPropagation();
          close();
        }}
      />
      <button type="submit" className="btn primary" disabled={!name.trim()}>
        {ROLES_COPY.create}
      </button>
      <button type="button" className="btn" onClick={close}>
        {ROLES_COPY.cancel}
      </button>
      {error && (
        <p role="alert" className="setting-error">
          {error}
        </p>
      )}
    </form>
  );
}
