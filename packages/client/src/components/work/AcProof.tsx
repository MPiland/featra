import { useContext, type MouseEvent } from "react";
import type { CardViewAc } from "@featra/work-format/card-view";
import { runLabel } from "@featra/work-format/review";
import { CARD_COPY } from "../../card-pane.ts";
import { CheckIcon, CircleIcon } from "../icons.tsx";
import { ExternalLinkContext } from "./PrChip.tsx";

/**
 * A criterion's proof, shared by the card pane and the review screen (STORY-69): its result, its linked test, and the
 * run that proved it. A CI run links to its page, opened in the OS browser; a run on this computer is "Local run".
 */
export function AcProof({ ac }: { ac: CardViewAc }) {
  const openExternal = useContext(ExternalLinkContext);
  const ci = ac.run?.startsWith("https://") ? ac.run : null;
  const open = (e: MouseEvent) => {
    e.preventDefault();
    if (ci) openExternal(ci);
  };
  return (
    <div className={`proof proof-${ac.proof}`}>
      {ac.proof === "passed" ? <CheckIcon /> : <CircleIcon />}
      <span>{CARD_COPY.proof[ac.proof]}</span>
      {ac.test && <code title={ac.test}>{ac.test}</code>}
      {ac.run &&
        (ci ? (
          <a className="proof-run" href={ci} title={ci} onClick={open}>
            {runLabel(ci)}
          </a>
        ) : (
          <span className="proof-run">{runLabel(ac.run)}</span>
        ))}
    </div>
  );
}
