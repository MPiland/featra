/**
 * The `update_card` tool (STORY-10): an agent reports on its card as it works. Its description is product copy: it is
 * what teaches an agent the limits, since Featra injects no system prompt (ADR 0006).
 */
import { REPORT_LIMITS, parseReportInput } from "@featra/work-format";
import { ToolRefusal, type Tool } from "./tool-types.ts";

const list = (description: string) => ({ type: "array", items: { type: "string" }, description });

export const UPDATE_CARD: Tool = {
  name: "update_card",
  failed: "Not updated.",
  description: [
    "Report progress on a story's or bug's card in Featra, as you work: the user sees it live in Work, marked Reported.",
    "Everything you write here is your claim, never proof: Featra marks it Reported, and only CI, the linked tests and the user make a story Verified, Proven or Accepted.",
    "A card has a stage, acceptance criteria (what must be true), tasks (the steps) and notes.",
    "`card` must be a story or a bug. In a story session you update your own card only (`card` is optional, and only the story's latest session may);",
    "a Dev Lead, the chat that drafted the feature or the one that started the story session, can name any card of its feature as `card`. Any other chat is refused.",
    "You may move the stage forward, up to the stage before Done: never to Done, Cancelled or backwards, which are the user's; a refusal lists this project's stages.",
    "A card that is already Done or Cancelled takes no report.",
    `Tick tasks and criteria by their text as the card has it (case and spacing don't matter; at most ${REPORT_LIMITS.text} characters each, at most ${REPORT_LIMITS.ticks} ticks per call): \`tasks\`, \`criteria\`. A tick never unticks.`,
    `Add tasks you discover (\`addTasks\`, at most ${REPORT_LIMITS.added}), and append one short line to the notes (\`note\`): not a log, only what the next reader needs.`,
    "Nothing else on the card can be changed.",
    "Evidence is a file that shows a criterion works, such as a screenshot. Write it in your worktree under",
    ".featra/evidence/<FEAT-N>/<STORY-M>/ (your feature's and your story's ids), then link it in `criteria` as `evidence`;",
    "a link anywhere else is refused, and so is one that leads out of that folder. Keep evidence as small as the story allows: one screenshot per criterion at most,",
    `each under ${REPORT_LIMITS.evidenceBytes / 1_000_000} MB, and none when a test already proves it.`,
    "This does not commit: commit the card and its evidence with your work. The input is checked, and a call that is refused changes nothing.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      card: { type: "string", description: "The card's id, such as STORY-10. A story session leaves it out." },
      stage: {
        type: "string",
        description: "The stage to move forward to, such as In Review or Acceptance. Never Done.",
      },
      tasks: list("Tasks to tick, each as the card words it."),
      addTasks: list(`New tasks to add, one line each (at most ${REPORT_LIMITS.added}).`),
      criteria: {
        type: "array",
        description: "Acceptance criteria to tick.",
        items: {
          type: "object",
          properties: {
            criterion: { type: "string", description: "The criterion, as the card words it." },
            evidence: {
              type: "string",
              description: "A file you wrote under .featra/evidence/<FEAT-N>/<STORY-M>/ that shows it works.",
            },
          },
          required: ["criterion"],
        },
      },
      note: {
        type: "string",
        description: `One short line for the card's notes (at most ${REPORT_LIMITS.note} characters).`,
      },
    },
    required: [],
  },
  async run(input, host) {
    const parsed = parseReportInput(input);
    if (!parsed.ok) throw new ToolRefusal(parsed.error);
    const { card: id, changes } = await host.update(parsed.value);
    return changes.length
      ? `Updated ${id}: ${changes.join(", ")}. Reported, not committed: commit the card and its evidence with your work.`
      : `Nothing to change on ${id}.`;
  },
};
