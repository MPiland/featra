import { useState } from "react";
import type { ApprovalAnswer } from "@featra/work-format/approvals";
import type { ChatItem } from "@featra/work-format/chat";
import { CHAT_COPY, toolMark } from "../../chats.ts";
import { ApprovalPrompt, showInput } from "./ApprovalPrompt.tsx";

type ToolItem = Extract<ChatItem, { kind: "tool" }>;

/**
 * One tool call: collapsed to the tool and a short summary; open, its input and result. A call waiting on the user's
 * approval shows its input and the choices inline.
 */
export function ToolRow({
  item,
  onAnswer,
}: {
  item: ToolItem;
  onAnswer: (tool: string, answer: ApprovalAnswer) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const failed = item.result?.isError === true;
  const mark = toolMark(item);
  return (
    <div className={failed || item.denied ? "chat-tool bad" : "chat-tool"}>
      <button type="button" className="chat-tool-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="chat-tool-name">{item.name}</span>
        <span className="chat-tool-summary">{item.summary}</span>
        {mark && <span className="chat-tool-mark">{mark}</span>}
      </button>
      {item.denied && item.reason && <p className="chat-tool-reason">{item.reason}</p>}
      {item.approval?.status === "pending" && (
        <ApprovalPrompt
          name={item.name}
          input={item.input}
          forChat={item.approval.forChat}
          covers={item.approval.covers ?? null}
          onAnswer={(answer) => onAnswer(item.id, answer)}
        />
      )}
      {open && (
        <div className="chat-tool-body">
          <h3>{CHAT_COPY.input}</h3>
          <pre>{showInput(item.input)}</pre>
          <h3>{CHAT_COPY.result}</h3>
          <pre>{item.result ? item.result.output : CHAT_COPY.noResult}</pre>
        </div>
      )}
    </div>
  );
}
