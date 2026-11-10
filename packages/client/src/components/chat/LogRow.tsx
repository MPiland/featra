import { useState } from "react";
import type { ChatItem } from "@featra/work-format/chat";
import { CHAT_COPY } from "../../chats.ts";

type LogItem = Extract<ChatItem, { kind: "log" }>;

/**
 * An entry the agent logged (STORY-47): where it went, what it says, and Undo, which takes back that entry only. When
 * the server can't (the user edited it, or Featra restarted), the reason shows under the row and Undo stays.
 */
export function LogRow({ item, onUndo }: { item: LogItem; onUndo: (entry: string) => Promise<string | null> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const undo = async () => {
    setBusy(true);
    setError(await onUndo(item.entry));
    setBusy(false);
  };
  return (
    <div className={item.undone ? "chat-log-row undone" : "chat-log-row"} role="status">
      <span>
        {CHAT_COPY.loggedTo} {item.file}
      </span>
      <span className="chat-log-summary">{item.summary}</span>
      {item.undone ? (
        <span>{CHAT_COPY.undone}</span>
      ) : (
        <button type="button" className="btn" disabled={busy} onClick={() => void undo()}>
          {CHAT_COPY.undo}
        </button>
      )}
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
