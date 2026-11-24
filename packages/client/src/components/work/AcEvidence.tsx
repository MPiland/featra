import type { CardViewAc } from "@featra/work-format/card-view";
import { createContext, useContext, useEffect, useState, type MouseEvent } from "react";
import { EVIDENCE_COPY, evidenceName, type EvidenceFile } from "@featra/work-format/evidence-link";
import type { EvidenceBridge } from "../../evidence.ts";
import { EvidenceViewer } from "./EvidenceViewer.tsx";

/** Where evidence is read from: the project, and the server's evidence methods. The card pane and review screen give it. */
export const EvidenceContext = createContext<{ dir: string; work: EvidenceBridge } | null>(null);

/** Opens the server's copy of an evidence file with the OS (the host's `app.openEvidence`); App provides it. */
export const OpenFileContext = createContext<(file: string) => void>(() => {});

/** Reads the evidence file once per card and path; null until it is read. */
function useEvidence(card: string, path: string): EvidenceFile | null {
  const source = useContext(EvidenceContext);
  const [file, setFile] = useState<{ key: string; file: EvidenceFile } | null>(null);
  const key = `${source?.dir}\n${card}\n${path}`;
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
 * rest of the criterion never depends on it; a criterion without evidence shows nothing here.
 */
export function AcEvidence({ card, ac }: { card: string; ac: CardViewAc }) {
  if (!ac.evidence) return null;
  return (
    <div className="ac-evidence">
      <EvidenceBody card={card} path={ac.evidence} />
    </div>
  );
}
