import type { CardViewAc } from "@featra/work-format/card-view";
import type { ProofNote } from "@featra/work-format/proof";
import { createContext, useContext, useEffect, useState, type MouseEvent } from "react";
import { EVIDENCE_COPY, evidenceName, type EvidenceFile } from "@featra/work-format/evidence-link";
import type { EvidenceBridge } from "../../evidence.ts";
import { EvidenceViewer } from "./EvidenceViewer.tsx";

/**
 * Where evidence is read from: the project and the server's evidence methods, given by the card pane and the review
 * screen; and what they show (the card's view, the review), whose every new revision has the evidence read again.
 */
export interface EvidenceSource {
  dir: string;
  work: EvidenceBridge;
  revision: unknown;
}
export const EvidenceContext = createContext<EvidenceSource | null>(null);

/** Opens the server's copy of an evidence file with the OS (the host's `app.openEvidence`); App provides it. */
export const OpenFileContext = createContext<(file: string) => void>(() => {});

/**
 * Reads the evidence file, and again with each new revision of what is shown, so a file attached since, or one a read
 * couldn't get for a moment, shows once the card changes; what was read stays shown meanwhile. Null until it is read.
 */
function useEvidence(card: string, path: string): EvidenceFile | null {
  const source = useContext(EvidenceContext);
  const [file, setFile] = useState<{ key: string; file: EvidenceFile } | null>(null);
  const key = `${source?.dir}\n${card}\n${path}`;
  // `source` is new with each revision of what is shown, so the file is read again then.
  useEffect(() => {
    if (!source) return undefined;
    let live = true;
    void source.work.readEvidence(source.dir, card, path).then((f) => {
      if (live) setFile({ key, file: f });
    });
    return () => {
      live = false;
    };
  }, [source, card, path, key]);
  if (!source) return { ok: false, problem: "unreadable" };
  return file?.key === key ? file.file : null;
}

/** A file that isn't a screenshot: a link that opens it with the OS, or says why it can't. */
function FileLink({ card, path, name }: { card: string; path: string; name: string }) {
  const source = useContext(EvidenceContext);
  const openFile = useContext(OpenFileContext);
  const [error, setError] = useState<string | null>(null);
  const open = async (e: MouseEvent) => {
    e.preventDefault();
    if (!source) return;
    const r = await source.work.openEvidence(source.dir, card, path);
    if (r.ok) openFile(r.file);
    setError(r.ok ? null : r.error);
  };
  return (
    <>
      <a className="evidence-link" href={`#${path}`} title={path} onClick={(e) => void open(e)}>
        {name}
      </a>
      {error && <span className="evidence-note">{error}</span>}
    </>
  );
}

/** The evidence file itself, as it was read. */
function EvidenceBody({ card, path }: { card: string; path: string }) {
  const file = useEvidence(card, path);
  const [viewing, setViewing] = useState(false);
  if (file === null) return null;
  if (!file.ok) return <span className="evidence-note">{EVIDENCE_COPY[file.problem]}</span>;
  if (file.kind === "file") return <FileLink card={card} path={path} name={file.name || evidenceName(path)} />;
  const src = `data:${file.mime};base64,${file.data}`;
  return (
    <>
      <button
        type="button"
        className="evidence-thumb"
        aria-label={EVIDENCE_COPY.open(file.name)}
        title={path}
        onClick={() => setViewing(true)}
      >
        <img src={src} alt="" />
      </button>
      {viewing && <EvidenceViewer name={file.name} src={src} onClose={() => setViewing(false)} />}
    </>
  );
}

/**
 * A criterion's evidence (STORY-72), shared by the card pane and the review screen: a screenshot as a thumbnail that
 * opens full size, any other file as a link that opens it with the OS, or a short note when it can't be shown. The
 * rest of the criterion never depends on it. Why Featra couldn't attach a screenshot (STORY-25) shows beside it, with
 * the dev server's last output when it didn't start; a criterion with neither shows nothing here.
 */
export function AcEvidence({ card, ac }: { card: string; ac: CardViewAc }) {
  if (!ac.evidence && !ac.proofNote) return null;
  return (
    <div className="ac-evidence">
      {ac.evidence && <EvidenceBody card={card} path={ac.evidence} />}
      {ac.proofNote && <ProofNoteLine note={ac.proofNote} />}
    </div>
  );
}

/** Why a screenshot wasn't attached, and the dev server's output behind a disclosure. */
function ProofNoteLine({ note }: { note: ProofNote }) {
  if (!note.output) return <span className="evidence-note">{note.note}</span>;
  return (
    <details className="evidence-note proof-note">
      <summary>{note.note}</summary>
      <pre>{note.output}</pre>
    </details>
  );
}
