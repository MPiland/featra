/**
 * Asking for changes before approving a feature (STORY-71). "Not yet" sends the user's reason to the feature's Dev
 * Lead chat as the user's message, then records it in the feature's history (send-then-record.ts: the chat has to
 * take the message first, and a busy or gone chat refuses it with nothing recorded). The feature's own Dev Lead marks
 * the changes handled through the Featra MCP's `mark_changes_handled`, and the user can dismiss them; both are recorded
 * only while changes are asked, read from the card fresh in the card lane, so a reply and a dismissal that race leave
 * one of them. Each write goes where the feature's branch has its card (feature-look's `writeFeature`).
 */
import {
  CHANGES_MESSAGES,
  CHANGES_REFUSALS,
  changesMessage,
  changesOpen,
  checkReason,
  draftAuthor,
  recordChangesAsked,
  recordChangesDismissed,
  recordChangesHandled,
  serializeCard,
  toIso,
  type Card,
  type ChangesHandledInput,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import type { ChatManager } from "./chat-manager.ts";
import { leadOf, mustLead } from "./feature-lead.ts";
import { lookAt, writeFeature, type FeatureLook } from "./feature-look.ts";
import type { runGit } from "./git-run.ts";
import { createMergeGit } from "./merge-git.ts";
import { sendThenRecord, type SendBackResult } from "./send-then-record.ts";
import type { Scan } from "./work-scan.ts";

export interface FeatureChangesDeps {
  scan: (dir: string) => Promise<Scan | null>;
  /** The lane every card write goes through; the server shares one. */
  lane?: CardLane;
  now: () => Date;
  chats: Pick<ChatManager, "list" | "dirOf" | "open" | "send">;
  gitCommand?: string;
  gitRun?: typeof runGit;
}

/** Refuses with `nothingAsked` unless changes are asked on the feature. */
const asked = (nothingAsked: string) => (found: FeatureLook) => {
  if (!changesOpen(found.card)) throw new ApiError(nothingAsked);
};

export function createFeatureChanges({
  scan: scanDir,
  lane = createCardLane(),
  now,
  chats,
  gitCommand,
  gitRun,
}: FeatureChangesDeps) {
  const git = createMergeGit(gitCommand, gitRun);
  const look = async (dir: string, id: string) => lookAt(git, await scanDir(dir), id);

  /** The feature in progress, read fresh, or why it can't take changes. */
  async function active(dir: string, id: string): Promise<FeatureLook> {
    const found = await look(dir, id);
    if (!found) throw new ApiError(CHANGES_REFUSALS.notActive(id));
    return found;
  }

  /** The feature's Dev Lead chat, open in this project, or why the reason can't reach it. */
  async function leadChat(dir: string, id: string): Promise<string> {
    const lead = leadOf(chats, dir, await active(dir, id));
    if (!lead) throw new ApiError(CHANGES_REFUSALS.noLead);
    if (chats.dirOf(lead) !== dir) throw new ApiError(CHANGES_REFUSALS.leadGone);
    return lead;
  }

  /** Writes `change` of the card as it is now, in the lane, unless `refuse` says why not (changes no longer asked). */
  async function whileAsked(
    dir: string,
    id: string,
    refuse: (found: FeatureLook) => void,
    change: (card: Card, at: string) => Card,
    commit: string,
  ): Promise<void> {
    await lane.exclusive(async () => {
      const found = await active(dir, id);
      refuse(found);
      const next = change(found.card, toIso(now()));
      await writeFeature(git, found, serializeCard(next), `${id}: ${commit}`);
    });
    await scanDir(dir).catch(() => null);
  }

  return {
    /** "Not yet": sends `reason` to the feature's Dev Lead chat, then records it as changes asked. */
    async ask(dir: string, id: string, reason: string): Promise<SendBackResult> {
      const refused = checkReason(reason);
      if (refused) throw new ApiError(refused);
      let lead = "";
      const result = await sendThenRecord({
        lane,
        open: async () => {
          lead = await leadChat(dir, id);
          await chats.open(lead);
        },
        send: () => chats.send(lead, changesMessage(id, reason)),
        record: async () => {
          const found = await look(dir, id);
          if (!found) return false;
          const next = recordChangesAsked(found.card, reason, "user", toIso(now()));
          await writeFeature(git, found, serializeCard(next), `${id}: changes asked`);
          return true;
        },
      });
      await scanDir(dir).catch(() => null);
      return result;
    },

    /** The user's Dismiss of the changes asked. */
    dismiss: (dir: string, id: string): Promise<void> =>
      whileAsked(
        dir,
        id,
        asked(CHANGES_REFUSALS.nothingAsked),
        (card, at) => recordChangesDismissed(card, "user", at),
        "changes dismissed",
      ),

    /** The Dev Lead's `mark_changes_handled`, by the chat `lead`, which must lead the feature; what it is told. */
    async handled(
      dir: string,
      input: ChangesHandledInput,
      lead: string,
    ): Promise<{ feature: string; message: string }> {
      const id = input.feature;
      const refuse = (found: FeatureLook) => {
        mustLead(chats, dir, found, lead);
        asked(CHANGES_MESSAGES.nothingAsked(id))(found);
      };
      const handle = (card: Card, at: string) => recordChangesHandled(card, input.reply, draftAuthor(lead), at);
      await whileAsked(dir, id, refuse, handle, "changes handled by the Dev Lead");
      return { feature: id, message: CHANGES_MESSAGES.handled(id) };
    },
  };
}

export type ChangesService = ReturnType<typeof createFeatureChanges>;
