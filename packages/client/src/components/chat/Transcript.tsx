import { useEffect, useRef } from "react";
import type { ChatItem } from "@featra/work-format/chat";
import { assertNever } from "@featra/work-format/guards";
import { CHAT_COPY, noticeText } from "../../chats.ts";
import { ToolRow } from "./ToolRow.tsx";

function Item({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case "user":
      return <div className="chat-msg user">{item.text}</div>;
    case "assistant":
      return <div className="chat-msg agent">{item.text}</div>;
    case "tool":
      return <ToolRow item={item} />;
    case "notice":
      return (
        <p className={item.notice.type === "stopped" ? "chat-notice" : "chat-notice bad"} role="status">
          {noticeText(item.notice)}
        </p>
      );
    default:
      return assertNever(item);
  }
}

/** The chat's messages, tool rows and notices, kept scrolled to the newest. */
export function Transcript({ items, running }: { items: readonly ChatItem[]; running: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  const last = items.at(-1);
  useEffect(() => {
    if (last) end.current?.scrollIntoView?.({ block: "end" });
  }, [last]);
  return (
    <div className="chat-log" role="log" aria-label={CHAT_COPY.transcript}>
      {items.map((item) => (
        <Item key={item.key} item={item} />
      ))}
      {running && <p className="chat-working">{CHAT_COPY.working}</p>}
      <div ref={end} />
    </div>
  );
}
