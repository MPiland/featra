/**
 * The proof question (STORY-25): when a Dev Lead's chat shapes a project's first feature and the project has no proof
 * yet, that chat asks the user once, on the question card agents use, how stories should show they work. The answer
 * is the project's `proof` setting, which Settings > Project changes later. Asked by the app, so it costs no tokens
 * and outlives the turn; while it waits it is not asked again, and once answered the setting keeps it from coming back.
 * A project that had features before is never asked: its proof is chosen in Settings.
 */
import { randomBytes } from "node:crypto";
import { PROOF_QUESTION, proofAnswer } from "@featra/work-format";
import type { ChatManager } from "./chat-manager-types.ts";
import type { ProofSettings } from "./proof-settings.ts";
import type { Scan } from "./work-scan.ts";

/** What the question is about: it keeps the card open past the turn that drafted the feature. */
export const PROOF_SUBJECT = "proof";
/** The question card's row. */
export const PROOF_TOOL = "proof";

export interface ProofQuestionDeps {
  scan: (dir: string) => Promise<Scan | null>;
  chats: Pick<ChatManager, "askQuestion">;
  settings: Pick<ProofSettings, "setProof">;
  log?: (message: string) => void;
  newId?: () => string;
}

export function createProofQuestion({
  scan,
  chats,
  settings,
  log = () => {},
  newId = () => `featra-proof-${randomBytes(6).toString("hex")}`,
}: ProofQuestionDeps) {
  const asking = new Set<string>();

  async function ask(dir: string, chat: string) {
    const answers = await chats.askQuestion(chat, {
      id: newId(),
      name: PROOF_TOOL,
      questions: [PROOF_QUESTION],
      subject: PROOF_SUBJECT,
    });
    const mode = proofAnswer(answers?.[PROOF_QUESTION.question]);
    if (mode === null) return;
    const { error } = await settings.setProof(dir, mode);
    if (error !== null) log(`Couldn't save the project's proof: ${error}`);
    else await scan(dir);
  }

  return {
    /** Chat `chat` of `dir` drafted a feature: asks the proof question when it is the project's first and none is set. */
    async shaped(dir: string, chat: string): Promise<void> {
      if (asking.has(dir)) return;
      const scanned = await scan(dir);
      const features = scanned?.resolution.cards.filter((c) => c.card.type === "feature") ?? [];
      if (!scanned || scanned.collected.config.proof !== null || features.length !== 1 || asking.has(dir)) return;
      asking.add(dir);
      void ask(dir, chat)
        .catch((err: unknown) =>
          log(`Couldn't ask for the project's proof: ${err instanceof Error ? err.message : String(err)}`),
        )
        .finally(() => asking.delete(dir));
    },
  };
}

export type ProofQuestion = ReturnType<typeof createProofQuestion>;
