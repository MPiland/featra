import { useState } from "react";
import type { ChatItem } from "@featra/work-format/chat";
import { validAnswers, type Answers, type Question } from "@featra/work-format/questions";
import { CHAT_COPY } from "../../chats.ts";

type ToolItem = Extract<ChatItem, { kind: "tool" }>;

/** What the user has picked for one question so far: some options, and their own words. */
interface Draft {
  picked: string[];
  other: string;
}

const EMPTY: Draft = { picked: [], other: "" };

/** The answers the drafts make, one per question; a single choice is the option or the user's own words. */
function answersOf(questions: readonly Question[], drafts: readonly Draft[]): Answers {
  return Object.fromEntries(
    questions.map(({ question, multiSelect }, i) => {
      const { picked, other } = drafts[i] ?? EMPTY;
      const own = other.trim() ? [other.trim()] : [];
      return [question, multiSelect ? [...picked, ...own] : own.length > 0 ? own : picked];
    }),
  );
}

interface QuestionFormProps {
  questions: readonly Question[];
  /** Sends the answers; resolves with why they weren't taken, or null. */
  onAnswer: (answers: Answers) => Promise<string | null>;
}

/**
 * The agent's questions waiting on the user (STORY-46): each with its options, one to pick or several where the agent
 * allows it, an Other field for the user's own words, and Submit once every question is answered. Native controls in
 * reading order, so Tab reaches each; Enter in an Other field submits when the answers are complete.
 */
function QuestionForm({ questions, onAnswer }: QuestionFormProps) {
  const [drafts, setDrafts] = useState<Draft[]>(() => questions.map(() => EMPTY));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answers = answersOf(questions, drafts);
  const complete = validAnswers(questions, answers) !== null;

  const change = (at: number, next: (d: Draft) => Draft) =>
    setDrafts((all) => all.map((d, i) => (i === at ? next(d) : d)));
  const toggle = (at: number, label: string, multi: boolean) =>
    change(at, (d) => ({
      // A single choice replaces the pick and drops the user's own words; several add and remove, and keep them.
      picked: !multi ? [label] : d.picked.includes(label) ? d.picked.filter((p) => p !== label) : [...d.picked, label],
      other: multi ? d.other : "",
    }));

  async function submit() {
    if (busy || !complete) return;
    setBusy(true);
    const why = await onAnswer(answers);
    setError(why);
    // Taken: the card stays busy until the answered event replaces it, so a second Enter can't send twice.
    if (why) setBusy(false);
  }

  return (
    <form
      className="chat-question-form"
      aria-label={CHAT_COPY.question}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {questions.map((q, at) => (
        <fieldset key={q.question} className="chat-question-set" disabled={busy}>
          <legend>
            {q.header && <span className="chat-question-header">{q.header}</span>}
            {q.question}
          </legend>
          {q.options.map((option) => (
            <label key={option.label} className="chat-question-option">
              <input
                type={q.multiSelect ? "checkbox" : "radio"}
                name={`question-${at}`}
                checked={drafts[at]?.picked.includes(option.label) ?? false}
                onChange={() => toggle(at, option.label, q.multiSelect)}
              />
              <span className="chat-question-label">{option.label}</span>
              {option.description && <span className="chat-question-desc">{option.description}</span>}
            </label>
          ))}
          <input
            type="text"
            className="text-field chat-question-other"
            aria-label={CHAT_COPY.other}
            placeholder={CHAT_COPY.other}
            value={drafts[at]?.other ?? ""}
            onChange={(e) => change(at, (d) => ({ picked: q.multiSelect ? d.picked : [], other: e.target.value }))}
          />
        </fieldset>
      ))}
      <div className="chat-approval-actions">
        <button type="submit" className="btn primary" disabled={busy || !complete}>
          {CHAT_COPY.submit}
        </button>
      </div>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * An AskUserQuestion call as a card: the questions to answer while it waits, and once answered, collapsed to each
 * question with what was chosen.
 */
export function QuestionCard({
  item,
  onAnswer,
}: {
  item: ToolItem;
  onAnswer: (tool: string, answers: Answers) => Promise<string | null>;
}) {
  const { question } = item;
  if (!question) return null;
  return (
    <div className="chat-tool chat-question" data-status={question.status}>
      <div className="chat-tool-head">
        <span className="chat-tool-name">{CHAT_COPY.question}</span>
        <span className="chat-tool-mark">
          {question.status === "pending" ? CHAT_COPY.needsAnswer : CHAT_COPY.answered}
        </span>
      </div>
      {question.status === "pending" ? (
        <QuestionForm questions={question.questions} onAnswer={(answers) => onAnswer(item.id, answers)} />
      ) : (
        <dl className="chat-question-answers" aria-label={CHAT_COPY.answered}>
          {question.questions.map((q) => (
            <div key={q.question}>
              <dt>{q.question}</dt>
              <dd>{(question.answers[q.question] ?? []).join(", ")}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
