import { useState, type KeyboardEvent } from "react";
import { FULL_ACCESS_WARNING } from "@featra/work-format/modes";
import { CHAT_COPY } from "../../chats.ts";

interface ComposerProps {
  running: boolean;
  /** A mode that lets the agent do anything without asking: marked beside the box, not only named in the header. */
  fullAccess?: boolean;
  /** Sends the message; resolves with why it wasn't sent, or null. */
  onSend: (text: string) => Promise<string | null>;
  onStop: () => void;
}

/** Enter sends, Shift+Enter adds a line; while a turn runs, Stop interrupts it. */
export function Composer({ running, fullAccess, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const blank = !text.trim();

  async function send() {
    if (running || blank) return;
    const sent = text;
    setText("");
    const why = await onSend(sent);
    setError(why);
    if (why) setText(sent);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void send();
  }

  return (
    <form
      className="chat-composer"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <textarea
        aria-label={CHAT_COPY.composer}
        placeholder={CHAT_COPY.placeholder}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {fullAccess && (
        <p className="chat-warning" role="status">
          <span aria-hidden="true">⚠</span> {FULL_ACCESS_WARNING}
        </p>
      )}
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
      {running ? (
        <button type="button" className="btn" onClick={onStop}>
          {CHAT_COPY.stop}
        </button>
      ) : (
        <button type="submit" className="btn primary" disabled={blank}>
          {CHAT_COPY.send}
        </button>
      )}
    </form>
  );
}
