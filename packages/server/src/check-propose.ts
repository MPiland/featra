/**
 * The Dev Lead's `propose_check_command` (STORY-56): the input is checked and each command is kept as a proposal in
 * Project settings. Nothing is applied here; only the user's confirm there does that.
 */
import { parseProposeInput } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import type { CheckSettings } from "./check-settings.ts";

/** Keeps what `params` proposes for `dir`; the names of the commands proposed. */
export async function proposeChecks(settings: Pick<CheckSettings, "propose">, dir: string, params: unknown) {
  const input = parseProposeInput(params);
  if (!input.ok) throw new ApiError(input.error);
  const proposed: string[] = [];
  if (input.value.command !== undefined) {
    await settings.propose(dir, "command", input.value.command);
    proposed.push("command");
  }
  if (input.value.testCommand !== undefined) {
    await settings.propose(dir, "testCommand", input.value.testCommand);
    proposed.push("testCommand");
  }
  return { proposed };
}
