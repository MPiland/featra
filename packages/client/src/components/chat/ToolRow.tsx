import { useState } from "react";
import type { ChatItem } from "@featra/work-format/chat";
import { CHAT_COPY } from "../../chats.ts";

type ToolItem = Extract<ChatItem, { kind: "tool" }>;

const show = (input: unknown) => (typeof input === "string" ? input : JSON.stringify(input, null, 2));

/** One tool call: collapsed to the tool and a short summary; open, its input and result. */
export function ToolRow({ item }: { item: ToolItem }) {
  const [open, setOpen] = useState(false);
  const failed = item.result?.isError === true;
  return (
    <div className={failed || item.denied ? "chat-tool bad" : "chat-tool"}>
      <button type="button" className="chat-tool-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="chat-tool-name">{item.name}</span>
        <span className="chat-tool-summary">{item.summary}</span>
        {item.denied && <span className="chat-tool-mark">{CHAT_COPY.denied}</span>}
        {item.stopped && <span className="chat-tool-mark">{CHAT_COPY.toolStopped}</span>}
      </button>
      {open && (
        <div className="chat-tool-body">
          <h3>{CHAT_COPY.input}</h3>
          <pre>{show(item.input)}</pre>
          <h3>{CHAT_COPY.result}</h3>
          <pre>{item.result ? item.result.output : CHAT_COPY.noResult}</pre>
        </div>
      )}
    </div>
  );
}
