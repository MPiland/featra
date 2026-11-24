/**
 * The Dev Lead's summary of a feature (STORY-69): written through the Featra MCP's `write_summary` into the feature's
 * card, where its branch has it (feature-look's `writeFeature`), in the card lane like every card write, and only by the
 * feature's own Dev Lead (feature-lead's `mustLead`), since it reads as written by them. The review screen shows it
 * under its own heading; the watch that pushes the screen sees the card change.
 */
import {
  draftAuthor,
  serializeCard,
  SUMMARY_MESSAGES,
  toIso,
  withSummary,
  type SummaryInput,
} from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { createCardLane, type CardLane } from "./card-lane.ts";
import type { ChatManager } from "./chat-manager.ts";
import { mustLead } from "./feature-lead.ts";
import { lookAt, writeFeature } from "./feature-look.ts";
import { createMergeGit } from "./merge-git.ts";
import type { runGit } from "./git-run.ts";
import type { Scan } from "./work-scan.ts";

export interface FeatureSummaryDeps {
  scan: (dir: string) => Promise<Scan | null>;
  /** The lane every card write goes through; the server shares one. */
  lane?: CardLane;
  now: () => Date;
  /** The chats, to find the feature's Dev Lead when it names none (`leadOf`). */
  chats: Pick<ChatManager, "list">;
  gitCommand?: string;
  gitRun?: typeof runGit;
}

export function createFeatureSummary({
  scan: scanDir,
  lane = createCardLane(),
  now,
  chats,
  gitCommand,
  gitRun,
}: FeatureSummaryDeps) {
  const git = createMergeGit(gitCommand, gitRun);
  return {
    /** Writes `input.summary` as `input.feature`'s summary, by the chat `lead`, which must lead it; what it is told. */
    async write(dir: string, input: SummaryInput, lead: string): Promise<{ feature: string; message: string }> {
      const id = input.feature;
      await lane.exclusive(async () => {
        const look = await lookAt(git, await scanDir(dir), id);
        if (!look) throw new ApiError(SUMMARY_MESSAGES.notActive(id));
        mustLead(chats, dir, look, lead);
        const next = withSummary(look.card, input.summary, draftAuthor(lead), toIso(now()));
        await writeFeature(git, look, serializeCard(next), `${id}: summary by the Dev Lead`);
      });
      await scanDir(dir).catch(() => null);
      return { feature: id, message: SUMMARY_MESSAGES.written(id) };
    },
  };
}

export type FeatureSummaryWriter = ReturnType<typeof createFeatureSummary>;
