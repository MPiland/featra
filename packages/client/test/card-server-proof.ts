// The fake card server's proof side (STORY-25): what the server adds to a story's card, and Preview.
import type { CardView, DesignReviewView, ProofNotes } from "@featra/work-format";
import type { CardBridge } from "../src/card-pane.ts";

/** What the server adds to a story's card from its proof (STORY-25). */
export interface CardProof {
  notes?: ProofNotes;
  preview?: boolean;
  /** The story's design review, as the server finds it (STORY-73). */
  designReview?: DesignReviewView;
}

/** `view` with `proof`'s notes on its criteria and Preview offered when it says so, as the server builds it. */
export function withProof(view: CardView, proof: CardProof | undefined): CardView {
  if (!proof) return view;
  const acs = [...view.acs];
  for (const [i, note] of Object.entries(proof.notes ?? {})) {
    const ac = acs[Number(i)];
    if (ac) acs[Number(i)] = { ...ac, proofNote: note };
  }
  return {
    ...view,
    acs,
    ...(proof.preview ? { preview: true as const } : {}),
    ...(proof.designReview ? { designReview: proof.designReview } : {}),
  };
}

/** Preview is the server's to prove (the dev server, its port): the fake records the call and answers a local URL. */
export const previewFake =
  (calls: string[], answer: CardBridge["previewStory"] | undefined): CardBridge["previewStory"] =>
  async (dir, id) => {
    calls.push(`previewStory:${dir}:${id}`);
    return answer ? answer(dir, id) : { ok: true, url: "http://localhost:5173" };
  };

/** Clearing a design review is the server's to prove (the lane, the card's history): the fake records the call. */
export const clearDesignReviewFake =
  (calls: string[], answer: CardBridge["clearDesignReview"] | undefined): CardBridge["clearDesignReview"] =>
  async (dir, id) => {
    calls.push(`clearDesignReview:${dir}:${id}`);
    return answer ? answer(dir, id) : { ok: true };
  };
