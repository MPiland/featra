/** The state the session manager keeps for each chat (ADR 0018). */
import {
  idleSummary,
  type Ask,
  type ChatEvent,
  type ChatSettings,
  type ChatSummary,
  type ModeInfo,
  type Role,
} from "@featra/work-format";
import type { ProviderSession } from "./provider.ts";

export type { Chat };
export { restored };

interface Chat {
  id: string;
  dir: string;
  /** Its row in the chat list. */
  summary: ChatSummary;
  /** The requests it waits on the user to answer (STORY-45). */
  asks: readonly Ask[];
  /** The provider's session it goes on with: the one the agent reported, or the one it was saved with. */
  session: string | null;
  /** A new session the agent reported, saved once the agent answers: before then Claude may not have written it. */
  pending: string | null;
  /** The log; null until a restored chat is opened, when its transcript is read. */
  events: ChatEvent[] | null;
  opening: Promise<void> | null;
  listeners: Set<(event: ChatEvent) => void>;
  /** The agent session, made when the chat starts or opens; null when its role or provider is missing. */
  agent: ProviderSession | null;
  /** Why it can't take a message without an agent: its role or provider is missing. */
  refusal: string | null;
  running: boolean;
  /** The role its agent runs as now, and what the composer last chose (STORY-22); null before its agent is made. */
  role: Role | null;
  settings: ChatSettings | null;
  /** The mode and note its role gave it when its agent was made (STORY-6): what the composer shows. */
  mode: ModeInfo | null;
  note: string | null;
  /** Its project is closed: the chat is kept, out of the list, until the project opens again. */
  closed: boolean;
}

/** A chat not yet opened: a saved one, or a new one before its log and agent are made. */
const restored = (id: string, dir: string, summary: ChatSummary, session: string | null): Chat => ({
  id,
  dir,
  summary: idleSummary(summary),
  asks: [],
  session,
  pending: null,
  events: null,
  opening: null,
  listeners: new Set(),
  agent: null,
  refusal: null,
  running: false,
  role: null,
  settings: null,
  mode: null,
  note: null,
  closed: false,
});
