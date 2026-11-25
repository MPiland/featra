/**
 * The `update_card` tool (STORY-10): an agent reports on its card as it works. Its description is product copy: it is
 * what teaches an agent the limits, since Featra injects no system prompt (ADR 0006).
 */
import { FINDINGS_MAX, REPORT_LIMITS, parseReportInput } from "@featra/work-format";
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
    "When the project takes screenshots, you can list a page instead: give the criterion a `page`, the route on the project's dev server that shows it, such as /settings.",
    "When the story moves to review, Featra starts the dev server in your worktree, captures each listed page and links it as that criterion's evidence, at no cost to you; the result says where, so commit those files too.",
    "Design review: when a story with screenshots Featra attached reaches review, Featra tells the Dev Lead that started it that it waits for design review, naming the screenshots.",
    "The Dev Lead opens them and checks them for layout and design problems (overlapping or clipped text, misalignment, uneven spacing, poor contrast, broken or empty states),",
    "then answers with `designReview`: {findings: what to fix} sends them to the story's session and keeps the story in review; {clear: true} lets it move on, and can go with `stage` Acceptance in one call.",
    "A story waiting for its design review can't move to Acceptance. Its session, once it has fixed the findings, reports {fixed: true}: Featra captures the screenshots again for another review.",
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
            page: {
              type: "string",
              description:
                "The route on the dev server that shows it works, such as /settings: Featra captures it when the story moves to review.",
            },
          },
          required: ["criterion"],
        },
      },
      note: {
        type: "string",
        description: `One short line for the card's notes (at most ${REPORT_LIMITS.note} characters).`,
      },
      designReview: {
        type: "object",
        description:
          "The design review of a story's screenshots: exactly one of findings (the Dev Lead), clear (the Dev Lead) or fixed (the story's session).",
        properties: {
          findings: {
            type: "string",
            description: `What to fix, sent to the story's session (at most ${FINDINGS_MAX} characters).`,
          },
          clear: { type: "boolean", description: "true: the screenshots pass, and the story may move on." },
          fixed: { type: "boolean", description: "true: the story's session fixed the findings." },
        },
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
