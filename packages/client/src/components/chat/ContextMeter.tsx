import { meterPercent, meterText, type ChatUsage } from "@featra/work-format/chat-controls";
import { CHAT_COPY } from "../../chats.ts";

/**
 * The chat's context: tokens used of the model's window, with a bar when the provider gave the window. Without a
 * window it shows only the tokens used. Hidden until the first turn reports usage.
 */
export function ContextMeter({ usage }: { usage: ChatUsage | null }) {
  if (!usage) return null;
  const percent = meterPercent(usage);
  return (
    <div className="context-meter" title={CHAT_COPY.context}>
      <span className="context-text">
        {CHAT_COPY.context}: {meterText(usage)}
      </span>
      {percent !== null && (
        <span
          className="context-bar"
          role="meter"
          aria-label={CHAT_COPY.context}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </span>
      )}
    </div>
  );
}
