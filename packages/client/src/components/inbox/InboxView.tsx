import type { InboxItem } from "@featra/work-format/inbox";
import type { ChatBridge } from "../../chats.ts";
import { INBOX_COPY } from "../../inbox.ts";
import { ApprovalPrompt } from "../chat/ApprovalPrompt.tsx";
import { QuestionForm } from "../chat/QuestionCard.tsx";

type Answering = Pick<ChatBridge, "approve" | "answer">;

interface InboxViewProps {
  items: readonly InboxItem[];
  /** Answers go through the chat's own bridge methods: the Inbox is not a second way to decide. */
  chats: Answering;
  onOpenChat: (chat: string) => void;
}

function Request({ item, chats }: { item: InboxItem; chats: Answering }) {
  const { request } = item;
  return request.type === "approval" ? (
    <ApprovalPrompt
      name={request.name}
      input={request.input}
      forChat={request.forChat}
      covers={request.covers ?? null}
      onAnswer={(answer) => chats.approve(item.chat, request.id, answer)}
    />
  ) : (
    <QuestionForm questions={request.questions} onAnswer={(answers) => chats.answer(item.chat, request.id, answers)} />
  );
}

/** The Inbox (STORY-7): each approval or question that has waited past the Inbox wait, with its chat and card. */
export function InboxView({ items, chats, onOpenChat }: InboxViewProps) {
  if (items.length === 0) {
    return (
      <section className="inbox inbox-empty">
        <p>{INBOX_COPY.empty}</p>
      </section>
    );
  }
  return (
    <section className="inbox" aria-label={INBOX_COPY.list}>
      <ul className="inbox-list">
        {items.map((item) => (
          <li key={`${item.chat}:${item.request.id}`} className="inbox-item" data-chat={item.chat}>
            <div className="inbox-head">
              <span className="inbox-kind">
                {item.request.type === "approval" ? INBOX_COPY.approval : INBOX_COPY.question}
              </span>
              {item.request.type === "approval" && <span className="inbox-tool">{item.request.name}</span>}
              <button type="button" className="btn inbox-chat" onClick={() => onOpenChat(item.chat)}>
                {item.chatName}
              </button>
              {item.card && <span className="inbox-card">{item.card}</span>}
            </div>
            <Request item={item} chats={chats} />
          </li>
        ))}
      </ul>
    </section>
  );
}
