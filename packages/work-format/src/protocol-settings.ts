/** The local server's project-settings methods (part of `ServerMethods`, protocol.ts): Checks, Proof, Preview and the design review. */
import type { ChecksPatch, ChecksView } from "./checks-types.ts";
import type { ProofPatch, ProofView } from "./proof-types.ts";

export interface SettingsMethods {
  /** Project settings' Checks section: where checks run, the commands, and the proposals waiting for the user (STORY-56). */
  "checks.load": { params: { dir: string }; result: ChecksView };
  /** Changes the Checks settings in the project's config (`null` clears one); answers with the section as it is after. */
  "checks.set": { params: { dir: string; patch: ChecksPatch }; result: ChecksView };
  /** Project settings' Proof section (STORY-25): the project's proof, its dev server, and its tests' screenshot folder. */
  "proof.load": { params: { dir: string }; result: ProofView };
  /** Changes the Proof settings in the project's config (`null` clears one); answers with the section as it is after. */
  "proof.set": { params: { dir: string; patch: ProofPatch }; result: ProofView };
  /**
   * Preview (STORY-25): starts the story's dev server in its worktree, or reuses the one running, and answers with its
   * URL for the host to open in a window. Refused with why when it has none or it didn't start.
   */
  "preview.start": { params: { dir: string; id: string }; result: { url: string } };
  /** The user clears a story's design review of its screenshots (STORY-73), and it moves on to Acceptance. */
  "story.clearDesignReview": { params: { dir: string; id: string }; result: null };
}
