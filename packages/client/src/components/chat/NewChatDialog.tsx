import { useEffect, useState } from "react";
import { errorMessage } from "@featra/work-format/guards";
import { ASK_MODE, modeLabel } from "@featra/work-format/modes";
import { CHAT_COPY, type ChatBridge, type Role } from "../../chats.ts";
import { Dialog } from "../Dialog.tsx";

interface NewChatDialogProps {
  chats: ChatBridge;
  dir: string;
  onStarted: (id: string, role: Role) => void;
  onClose: () => void;
}

/** Picks the role a new chat starts from, with the mode it starts in: the provider's own setting, or Ask. */
export function NewChatDialog({ chats, dir, onStarted, onClose }: NewChatDialogProps) {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    let live = true;
    chats.roles(dir).then(
      (r) => live && setRoles(r),
      (err: unknown) => live && setError(errorMessage(err)),
    );
    return () => {
      live = false;
    };
  }, [chats, dir]);

  async function start(role: Role) {
    setStarting(true);
    setError(null);
    try {
      const r = await chats.start(dir, role.id);
      if (r.ok) onStarted(r.id, role);
      else setError(r.error);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog title={CHAT_COPY.newChat} closeLabel="Cancel" onClose={onClose}>
      {roles?.length === 0 && <p>{CHAT_COPY.noRoles}</p>}
      <ul className="role-list" aria-label={CHAT_COPY.roles}>
        {roles?.map((role) => (
          <li key={role.id}>
            <button type="button" className="role-pick" disabled={starting} onClick={() => void start(role)}>
              <span className="role-name">{role.name}</span>
              <span className="role-meta">
                {role.model} · {role.effort} · {modeLabel(role.mode ?? ASK_MODE)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {starting && <p role="status">{CHAT_COPY.starting}</p>}
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
