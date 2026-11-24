import { createPortal } from "react-dom";
import { EVIDENCE_COPY } from "@featra/work-format/evidence-link";
import { Dialog } from "../Dialog.tsx";

/**
 * A screenshot at full size (STORY-72), over the app: Escape or Close shuts it, and focus goes back to the thumbnail
 * that opened it (the Dialog's own focus return).
 */
export function EvidenceViewer({ name, src, onClose }: { name: string; src: string; onClose: () => void }) {
  return createPortal(
    <div className="evidence-viewer">
      <Dialog title={EVIDENCE_COPY.viewer(name)} onClose={onClose} closeLabel={EVIDENCE_COPY.close}>
        <img className="evidence-full" src={src} alt={name} />
      </Dialog>
    </div>,
    document.body,
  );
}
